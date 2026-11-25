use std::{
    fs::File,
    io::{BufRead, BufReader, BufWriter, Read, Write},
    path::Path,
};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{err, s};
use crate::logs::{codex_home, file_identity, user_home, DesktopMetadata};

const PAGE_SIZE: i64 = 20;
const MAX_SESSIONS: usize = 100;
const SKILL_MATCH: &str = "category='skill' AND trigger<>'candidate'
    AND ((?1<>'' AND server=?1) OR (?1='' AND server='' AND name=?2))";

#[derive(Deserialize, Serialize)]
struct SessionKey {
    provider: String,
    session: String,
}

fn skill_identity(input: &Value) -> Result<(&str, &str), String> {
    let path = s(input, "path");
    let name = s(input, "name");
    if path.is_empty() && name.is_empty() {
        return Err("A skill identity is required.".into());
    }
    Ok((path, name))
}

pub fn list(db: &Connection, input: &Value) -> Result<Value, String> {
    let (path, name) = skill_identity(input)?;
    let offset = input["offset"].as_i64().unwrap_or_default().max(0);
    let mut stmt = db
        .prepare(&format!(
            "SELECT provider,session_id,max(time),count(*),min(source) FROM insight_unique
         WHERE {SKILL_MATCH} GROUP BY provider,session_id
         ORDER BY max(time) DESC,provider,session_id LIMIT ?3 OFFSET ?4"
        ))
        .map_err(err)?;
    let mut rows = stmt
        .query(params![path, name, PAGE_SIZE + 1, offset])
        .map_err(err)?;
    let desktop = DesktopMetadata::read(&codex_home(&user_home()));
    let mut items = Vec::new();
    while let Some(row) = rows.next().map_err(err)? {
        let provider: String = row.get(0).map_err(err)?;
        let session: String = row.get(1).map_err(err)?;
        let time: Option<i64> = row.get(2).map_err(err)?;
        let call_count: i64 = row.get(3).map_err(err)?;
        let source: String = row.get(4).map_err(err)?;
        let title = if provider == "Codex" {
            desktop.titles.get(&session).cloned()
        } else {
            None
        };
        let title = title
            .map(Ok)
            .unwrap_or_else(|| session_title(db, &source, &session))?;
        items.push(
            json!({"key":SessionKey{provider,session},"title":title,"source":source,
            "time":time,"callCount":call_count}),
        );
    }
    let more = items.len() > PAGE_SIZE as usize;
    items.truncate(PAGE_SIZE as usize);
    Ok(json!({"items":items,"more":more,"offset":offset}))
}

fn session_title(db: &Connection, source: &str, id: &str) -> Result<String, String> {
    let mut stmt = db
        .prepare(
            "SELECT json_extract(body,'$.content') FROM events WHERE path=?1
         AND json_extract(body,'$.event')='message' AND json_extract(body,'$.role')='user'
         ORDER BY ordinal,sub LIMIT 25",
        )
        .map_err(err)?;
    let rows = stmt
        .query_map([source], |row| row.get::<_, Option<String>>(0))
        .map_err(err)?;
    for row in rows {
        if let Some(text) = row.map_err(err)? {
            let text = text.trim();
            if !text.is_empty() && !text.starts_with(['#', '<']) {
                return Ok(text
                    .lines()
                    .next()
                    .unwrap_or_default()
                    .chars()
                    .take(100)
                    .collect());
            }
        }
    }
    Ok(id.to_owned())
}

struct ExportSource {
    key: SessionKey,
    file: File,
    bytes: u64,
    filename: String,
}

fn export_sources(db: &Connection, input: &Value) -> Result<Vec<ExportSource>, String> {
    let (path, name) = skill_identity(input)?;
    let keys: Vec<SessionKey> = serde_json::from_value(input["sessions"].clone()).map_err(err)?;
    if keys.is_empty() || keys.len() > MAX_SESSIONS {
        return Err("Select 1–100 linked sessions.".into());
    }
    let mut unique = std::collections::HashSet::new();
    let mut sources = Vec::with_capacity(keys.len());
    let mut stmt = db
        .prepare(&format!(
        "SELECT DISTINCT c.source,s.identity FROM insight_calls c JOIN sources s ON c.source=s.path
         WHERE {SKILL_MATCH} AND c.provider=?3 AND c.session_id=?4
         ORDER BY s.cursor DESC,c.source"
    ))
        .map_err(err)?;
    for key in keys {
        if !unique.insert((key.provider.clone(), key.session.clone())) {
            continue;
        }
        let mut candidates = stmt
            .query(params![path, name, key.provider, key.session])
            .map_err(err)?;
        let mut available = None;
        while let Some(row) = candidates.next().map_err(err)? {
            let location: String = row.get(0).map_err(err)?;
            let identity: String = row.get(1).map_err(err)?;
            let path = Path::new(&location);
            let Ok(file) = File::open(path) else {
                continue;
            };
            let Ok(metadata) = file.metadata() else {
                continue;
            };
            if metadata.is_file() && file_identity(&metadata) == identity {
                available = Some((
                    file,
                    metadata.len(),
                    path.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned(),
                ));
                break;
            }
        }
        let (file,bytes,filename)=available.ok_or_else(|| format!(
            "Original log unavailable for session {}. Refresh the index and check the source before exporting.",key.session))?;
        sources.push(ExportSource {
            key,
            file,
            bytes,
            filename,
        });
    }
    Ok(sources)
}

pub fn save(db: &Connection, input: &Value, path: &Path) -> Result<(), String> {
    let sources = export_sources(db, input)?;
    let directory = path.parent().ok_or("Choose a destination file.")?;
    let mut staging = tempfile::NamedTempFile::new_in(directory).map_err(err)?;
    {
        let mut output = BufWriter::new(staging.as_file_mut());
        output
            .write_all(b"{\n\"format\":\"agentlens-full-sessions\",\n\"version\":1,\n\"skill\":")
            .map_err(err)?;
        serde_json::to_writer(&mut output, s(input, "name")).map_err(err)?;
        output.write_all(b",\n\"sessions\":[").map_err(err)?;
        for (index, source) in sources.into_iter().enumerate() {
            if index > 0 {
                output.write_all(b",").map_err(err)?;
            }
            output.write_all(b"\n{\"session\":").map_err(err)?;
            serde_json::to_writer(&mut output, &source.key).map_err(err)?;
            output.write_all(b",\"sourceFile\":").map_err(err)?;
            serde_json::to_writer(&mut output, &source.filename).map_err(err)?;
            output.write_all(b",\"records\":[").map_err(err)?;
            write_records(&mut output, source.file, source.bytes)?;
            output.write_all(b"\n]}").map_err(err)?;
        }
        output.write_all(b"\n]\n}\n").map_err(err)?;
        output.flush().map_err(err)?;
    }
    staging.persist(path).map_err(err)?;
    Ok(())
}

fn write_records(output: &mut impl Write, reader: impl Read, bytes: u64) -> Result<(), String> {
    let mut reader = BufReader::new(reader.take(bytes));
    let mut line = Vec::new();
    let mut first = true;
    loop {
        line.clear();
        if reader.read_until(b'\n', &mut line).map_err(err)? == 0 {
            break;
        }
        if !first {
            output.write_all(b",").map_err(err)?;
        }
        first = false;
        output.write_all(b"\n").map_err(err)?;
        if serde_json::from_slice::<serde::de::IgnoredAny>(&line).is_ok() {
            output.write_all(&line).map_err(err)?;
        } else if let Ok(text) = std::str::from_utf8(&line) {
            serde_json::to_writer(&mut *output, &json!({"unparsedJsonlLine":text})).map_err(err)?;
        } else {
            output.write_all(b"{\"unparsedJsonlHex\":\"").map_err(err)?;
            for byte in &line {
                write!(output, "{byte:02x}").map_err(err)?;
            }
            output.write_all(b"\"}").map_err(err)?;
        }
    }
    if reader.get_ref().limit() != 0 {
        return Err("An original log changed during export. Try again.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_only_selected_linked_sessions_and_includes_other_turns() {
        let root = tempfile::tempdir().unwrap();
        let db = crate::logs::open(&root.path().join("index.sqlite3")).unwrap();
        let skill = "/test/report/SKILL.md";
        for (session, source_skill, invocations) in [
            ("first", skill, 2),
            ("second", skill, 1),
            ("unselected", skill, 1),
            ("other-skill", "/other/report/SKILL.md", 1),
        ] {
            let path = root.path().join(format!("{session}.jsonl"));
            let contents = format!(
                "{{\"type\":\"session_meta\",\"payload\":{{\"id\":\"{session}\"}}}}\n\
                 {{\"type\":\"later_turn\",\"output\":\"full raw tool output\"}}\n\
                 {{\"incomplete\""
            );
            std::fs::write(&path, &contents).unwrap();
            let metadata = path.metadata().unwrap();
            let source = path.to_str().unwrap();
            db.execute(
                "INSERT INTO sources VALUES (?1,'',?2,?3)",
                params![
                    source,
                    i64::try_from(metadata.len()).unwrap(),
                    file_identity(&metadata)
                ],
            )
            .unwrap();
            for identity in 0..invocations {
                db.execute(
                    "INSERT INTO insight_calls VALUES (?1,?2,?3,'skill','report',?4,'explicit','high',0,'','Codex','turn','unknown',NULL,'[]')",
                    params![source, identity.to_string(), session, source_skill],
                ).unwrap();
            }
        }
        let candidates = list(&db, &json!({"path":skill,"name":"report"})).unwrap();
        let items = candidates["items"].as_array().unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!(items[0]["key"]["session"], "first");
        assert_eq!(items[0]["callCount"], 2);

        let output = root.path().join("export.json");
        let keys = [
            json!({"provider":"Codex","session":"first"}),
            json!({"provider":"Codex","session":"second"}),
        ];
        save(
            &db,
            &json!({"path":skill,"name":"report","sessions":keys}),
            &output,
        )
        .unwrap();
        let data: Value = serde_json::from_slice(&std::fs::read(&output).unwrap()).unwrap();
        let sessions = data["sessions"].as_array().unwrap();
        assert_eq!(sessions.len(), 2);
        for (session, key) in sessions.iter().zip(keys) {
            assert_eq!(session["session"], key);
            assert_eq!(session["records"][1]["output"], "full raw tool output");
            assert_eq!(
                session["records"][2]["unparsedJsonlLine"],
                "{\"incomplete\""
            );
        }
        let unrelated = json!({"provider":"Codex","session":"other-skill"});
        assert!(save(
            &db,
            &json!({"path":skill,"name":"report","sessions":[unrelated]}),
            &output
        )
        .is_err());
        assert_eq!(
            data,
            serde_json::from_slice::<Value>(&std::fs::read(&output).unwrap()).unwrap()
        );
    }
}
