pub mod evaluations;
mod registry;

use super::{files, ingest_batch, Provider};
use rusqlite::{params, Connection, Transaction};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS insight_calls (
            source TEXT NOT NULL, identity TEXT NOT NULL, session_id TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
            server TEXT NOT NULL, trigger TEXT NOT NULL, confidence TEXT NOT NULL, time INTEGER,
            project TEXT NOT NULL, provider TEXT NOT NULL, turn TEXT NOT NULL, outcome TEXT NOT NULL,
            duration INTEGER, evidence TEXT NOT NULL, PRIMARY KEY(source, identity)
        );
        CREATE INDEX IF NOT EXISTS insight_calls_identity ON insight_calls(provider,session_id,identity);
        CREATE VIEW IF NOT EXISTS insight_unique AS SELECT * FROM (
            SELECT c.*,row_number() OVER(PARTITION BY c.provider,c.session_id,c.identity
            ORDER BY CASE WHEN c.outcome IN ('success','failure','declined') THEN 0 ELSE 1 END,coalesce(length(c.evidence),0) DESC,c.source) AS copy_rank FROM insight_calls c
        ) WHERE copy_rank=1;
        CREATE INDEX IF NOT EXISTS insight_calls_time ON insight_calls(time,category);
        CREATE INDEX IF NOT EXISTS insight_calls_project ON insight_calls(project,time);
        CREATE INDEX IF NOT EXISTS insight_calls_name ON insight_calls(category,name,time);
        CREATE TABLE IF NOT EXISTS insight_checkpoints (
            source TEXT PRIMARY KEY,cursor INTEGER NOT NULL, errors INTEGER NOT NULL DEFAULT 0,
            indexed_at INTEGER NOT NULL, failed INTEGER NOT NULL DEFAULT 0,
            stamp TEXT NOT NULL DEFAULT '', first_time INTEGER,last_time INTEGER
        );
        CREATE TABLE IF NOT EXISTS insight_feedback (
            id INTEGER PRIMARY KEY, subject TEXT NOT NULL, source TEXT NOT NULL,
            turn TEXT NOT NULL, offset INTEGER, version TEXT, category TEXT NOT NULL,
            body TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL
        );"
    )?;
    registry::migrate(db)?;
    evaluations::migrate(db)
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn s<'a>(value: &'a Value, name: &str) -> &'a str {
    value[name].as_str().unwrap_or_default()
}

pub(super) fn skill_evidence(payload: &Value) -> Vec<Value> {
    let mut found = Vec::new();
    let metadata = &payload["internal_chat_message_metadata_passthrough"];
    let Some(parts) = payload["content"].as_array() else {
        return found;
    };
    for (i, part) in parts.iter().enumerate() {
        let Some(text) = part["text"].as_str() else {
            continue;
        };
        let kind = metadata["content_item_kinds"][i].as_str();
        if kind == Some("skills.selected_skill_instructions")
            && text.trim_start().starts_with("<skill>")
        {
            let tag = |name: &str| {
                let start = format!("<{name}>");
                let end = format!("</{name}>");
                text.split_once(&start)?
                    .1
                    .split_once(&end)
                    .map(|(value, _)| value.trim())
            };
            if let (Some(name), Some(path)) = (tag("name"), tag("path")) {
                if path.ends_with("/SKILL.md") || path.ends_with("\\SKILL.md") {
                    found.push(json!({"event":"skill_evidence","skill":name,"path":path,"trigger":"unknown","proof":"selected_instructions"}));
                }
            }
        } else if kind == Some("user.text") {
            let mut next = text.trim_start();
            while let Some(link) = next.strip_prefix("[$") {
                let Some((name, link)) = link.split_once("](") else {
                    break;
                };
                let Some((path, rest)) = link.split_once(')') else {
                    break;
                };
                if name.is_empty()
                    || name.contains(['\n', '[', ']'])
                    || !(path.ends_with("/SKILL.md") || path.ends_with("\\SKILL.md"))
                {
                    break;
                }
                found.push(json!({"event":"skill_evidence","skill":name,"path":path,"trigger":"explicit","proof":"user_selection"}));
                next = rest.trim_start();
            }
        }
    }
    found
}

#[derive(Default)]
struct Observation {
    category: String,
    name: String,
    server: String,
    trigger: String,
    confidence: String,
    time: Option<i64>,
    turn: String,
    outcome: String,
    duration: Option<i64>,
    evidence: Vec<Value>,
}

fn evidence(step: &Value, proof: &str) -> Value {
    json!({"byteOffset":step["sourceOffset"],"resultOffset":step["resultOffset"],"kind":proof,"callId":step["call"]})
}

fn payload_shape(text: &str) -> Value {
    if text.is_empty() {
        return Value::Null;
    }
    let length = text.len();
    let shape = match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => json!({"kind":"object","fields":map.len()}),
        Ok(Value::Array(values)) => json!({"kind":"array","items":values.len()}),
        Ok(_) => json!({"kind":"scalar"}),
        Err(_) => json!({"kind":"text"}),
    };
    json!({"shape":shape,"bytes":length})
}

pub(super) fn timestamp(value: &Value) -> Option<i64> {
    value
        .as_str()
        .and_then(|iso| chrono::DateTime::parse_from_rfc3339(iso).ok())
        .map(|date| date.timestamp())
}

pub(super) fn stamp(meta: &std::fs::Metadata) -> String {
    let nanos = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_nanos())
        .unwrap_or(0);
    format!("{}:{}:{}", super::file_identity(meta), meta.len(), nanos)
}

fn skill_path(value: &str) -> Option<(String, String)> {
    let cleaned =
        value.trim_matches(|ch: char| matches!(ch, '\'' | '"' | '`' | '(' | ')' | ',' | ';'));
    let path = cleaned.replace('\\', "/");
    let root = path.strip_suffix("/SKILL.md")?;
    let name = root.rsplit('/').next()?;
    if name.is_empty() {
        return None;
    }
    Some((name.to_owned(), path))
}

fn script_reference(value: &str) -> Option<(String, String)> {
    let normalized = value
        .trim_matches(['\'', '"', '`', '(', ')', ',', ';'])
        .replace('\\', "/");
    let (prefix, rest) = normalized.split_once("/skills/")?;
    let (name, resource) = rest.split_once('/')?;
    if name.is_empty() || !resource.starts_with("scripts/") {
        return None;
    }
    Some((name.to_owned(), format!("{prefix}/skills/{name}/SKILL.md")))
}

fn record_skill(
    rows: &mut BTreeMap<String, Observation>,
    event: &Value,
    name: &str,
    path: &str,
    trigger: &str,
    proof: &str,
    time: Option<i64>,
) {
    let turn = s(event, "turnId");
    // Legacy records without an explicit turn cannot establish co-occurrence.
    let identity = if turn.is_empty() {
        event["sourceOffset"].to_string()
    } else {
        turn.to_owned()
    };
    let key = json!(["skill", identity, if path.is_empty() { name } else { path }]).to_string();
    let row = rows.entry(key).or_insert_with(|| Observation {
        category: "skill".into(),
        name: name.into(),
        server: path.into(),
        turn: turn.into(),
        trigger: trigger.into(),
        confidence: if trigger == "candidate" {
            "low".into()
        } else {
            "high".into()
        },
        time,
        ..Observation::default()
    });
    let rank = |value: &str| match value {
        "explicit" => 4,
        "implicit" => 3,
        "unknown" => 2,
        _ => 1,
    };
    if rank(trigger) > rank(&row.trigger) {
        row.trigger = trigger.into();
        row.confidence = "high".into();
        row.time = time.or(row.time);
    }
    let item = evidence(event, proof);
    if !row.evidence.contains(&item) {
        row.evidence.push(item);
    }
}

pub(super) fn project_session(
    tx: &Transaction,
    source: &str,
    provider: Provider,
    project: &str,
    cursor: u64,
    errors: u64,
    stamp: &str,
    time_range: (Option<i64>, Option<i64>),
) -> Result<(), String> {
    let mut query = tx
        .prepare("WITH relevant AS (
            SELECT ordinal,sub,body FROM events WHERE path=?1 AND (
                json_extract(body,'$.event') IN ('meta','skill_evidence') OR
                (json_extract(body,'$.event') IN ('call','evidence') AND (
                    json_type(body,'$.server')='text' OR json_extract(body,'$.tool')='Skill' OR
                    substr(json_extract(body,'$.namespace'),1,5)='mcp__' OR
                    substr(json_extract(body,'$.tool'),1,5)='mcp__' OR
                    instr(body,'SKILL.md')>0 OR instr(body,'/scripts/')>0
                ))
            ))
            SELECT ordinal,body FROM (
                SELECT ordinal,sub,body FROM relevant UNION ALL
                SELECT ordinal,sub,body FROM events WHERE path=?1 AND json_extract(body,'$.event')='result'
                  AND json_extract(body,'$.call') IN (SELECT json_extract(body,'$.call') FROM relevant)
            ) ORDER BY ordinal,sub")
        .map_err(err)?;
    let events = query
        .query_map([source], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(err)?
        .map(|result| {
            let (offset, body) = result.map_err(err)?;
            let mut event: Value = serde_json::from_str(&body).map_err(err)?;
            event["sourceOffset"] = json!(offset);
            Ok::<_, String>(event)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let session_id = events
        .iter()
        .find(|event| event["event"] == "meta")
        .map(|event| s(event, "sessionId"))
        .filter(|id| !id.is_empty())
        .unwrap_or(source);
    let session_id = if provider == Provider::Claude {
        std::path::Path::new(source)
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or(session_id)
    } else {
        session_id
    };
    let project_path = std::path::Path::new(project);
    let project = if project_path.is_absolute() {
        project_path
            .ancestors()
            .find(|candidate| candidate.join(".git").exists())
            .unwrap_or(project_path)
            .to_string_lossy()
    } else {
        std::borrow::Cow::Borrowed(project)
    };
    let mut rows = BTreeMap::new();
    for event in &events {
        if event["event"] == "skill_evidence" {
            record_skill(
                &mut rows,
                event,
                s(event, "skill"),
                &s(event, "path").replace('\\', "/"),
                s(event, "trigger"),
                s(event, "proof"),
                timestamp(&event["time"]),
            );
        }
    }
    for step in super::timeline(&events) {
        let tool = s(&step, "tool");
        if tool.is_empty() {
            continue;
        }
        let time = timestamp(&step["time"]);
        if provider == Provider::Claude && tool == "Skill" {
            if let Ok(args) = serde_json::from_str::<Value>(s(&step, "args")) {
                if let Some(name) = args["skill"].as_str().filter(|name| !name.is_empty()) {
                    record_skill(
                        &mut rows,
                        &step,
                        name,
                        "",
                        "unknown",
                        "native_skill_call",
                        time,
                    );
                }
            }
        }
        let namespace = s(&step, "namespace");
        let (server, name) = if !s(&step, "server").is_empty() {
            (s(&step, "server"), tool)
        } else if let Some(server) = namespace.strip_prefix("mcp__") {
            (server, tool)
        } else if let Some((server, name)) = tool
            .strip_prefix("mcp__")
            .and_then(|id| id.split_once("__"))
        {
            (server, name)
        } else {
            ("", "")
        };
        if !server.is_empty() && !name.is_empty() {
            let call = s(&step, "call");
            let key = json!([
                "mcp",
                server,
                name,
                if call.is_empty() {
                    step["sourceOffset"].to_string()
                } else {
                    call.into()
                }
            ])
            .to_string();
            let outcome = match s(&step, "outcome").to_ascii_lowercase().as_str() {
                "declined" => "declined",
                _ => match s(&step, "state") {
                    "失败" => "failure",
                    "成功" => "success",
                    _ => "unknown",
                },
            };
            rows.insert(
                key,
                Observation {
                    category: "mcp".into(),
                    name: name.into(),
                    server: server.into(),
                    confidence: "high".into(),
                    time,
                    turn: s(&step, "turnId").into(),
                    outcome: outcome.into(),
                    duration: step["durationMs"].as_i64(),
                    evidence: vec![{
                        let mut proof = evidence(&step, "mcp_tool_call");
                        proof["arguments"] = payload_shape(s(&step, "args"));
                        proof["result"] = payload_shape(s(&step, "output"));
                        proof
                    }],
                    ..Observation::default()
                },
            );
        }
        let mut paths = Vec::new();
        if let Some(pair) = skill_path(s(&step, "path")) {
            paths.push(pair);
        }
        for field in ["command", "script", "args"] {
            for token in s(&step, field)
                .split_whitespace()
                .filter(|t| t.contains("SKILL.md"))
            {
                if let Some(pair) = skill_path(token) {
                    if !paths.contains(&pair) {
                        paths.push(pair);
                    }
                }
            }
        }
        for token in s(&step, "command")
            .split_whitespace()
            .chain(s(&step, "script").split_whitespace())
        {
            if let Some((name, path)) = script_reference(token) {
                record_skill(
                    &mut rows,
                    &step,
                    &name,
                    &path,
                    "candidate",
                    "skill_script_reference",
                    time,
                );
            }
        }
        for (name, path) in paths {
            record_skill(
                &mut rows,
                &step,
                &name,
                &path,
                "candidate",
                "skill_file_reference",
                time,
            );
        }
    }
    tx.execute("DELETE FROM insight_calls WHERE source=?1", [source])
        .map_err(err)?;
    let mut insert = tx
        .prepare(
            "INSERT INTO insight_calls VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        )
        .map_err(err)?;
    for (key, row) in rows {
        insert
            .execute(params![
                source,
                key,
                session_id,
                row.category,
                row.name,
                row.server,
                row.trigger,
                row.confidence,
                row.time,
                project,
                provider.name(),
                row.turn,
                row.outcome,
                row.duration,
                json!(row.evidence).to_string()
            ])
            .map_err(err)?;
    }
    tx.execute("INSERT INTO insight_checkpoints(source,cursor,errors,indexed_at,failed,stamp,first_time,last_time) VALUES (?1,?2,?3,?4,0,?5,?6,?7)
      ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,errors=excluded.errors,indexed_at=excluded.indexed_at,failed=0,stamp=excluded.stamp,first_time=excluded.first_time,last_time=excluded.last_time",
      params![source,cursor as i64,errors as i64,now(),stamp,time_range.0,time_range.1]).map_err(err)?;
    Ok(())
}

fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}

pub fn index(db: &mut Connection, budget: usize) -> Result<Value, String> {
    let extra = super::folders(db)?;
    let mut paths: Vec<_> = files(&extra).into_iter().collect();
    let checked = {
        let mut q = db
            .prepare("SELECT source,stamp FROM insight_checkpoints")
            .map_err(err)?;
        let rows = q
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(err)?;
        rows.collect::<Result<BTreeMap<_, _>, _>>().map_err(err)?
    };
    paths.sort_by_cached_key(|(path, _)| {
        std::cmp::Reverse(path.metadata().and_then(|m| m.modified()).ok())
    });
    let mut processed = 0;
    let mut pending = 0;
    let mut errors = 0;
    for (path, (provider, _)) in paths {
        let Ok(meta) = path.metadata() else { continue };
        let key = path.to_string_lossy();
        let signature = stamp(&meta);
        if checked.get(key.as_ref()) == Some(&signature) {
            continue;
        }
        if processed >= budget {
            pending += 1;
            continue;
        }
        processed += 1;
        if ingest_batch(db, &path, provider, Some(8 * 1024 * 1024)).is_err() {
            errors += 1;
            db.execute("INSERT INTO insight_checkpoints(source,cursor,indexed_at,failed,stamp) VALUES (?1,0,?2,1,?3)
              ON CONFLICT(source) DO UPDATE SET failed=1,indexed_at=excluded.indexed_at,stamp=excluded.stamp",params![key.as_ref(),now(),signature]).map_err(err)?;
        } else {
            let (failed, after) = db
                .query_row(
                    "SELECT failed,stamp FROM insight_checkpoints WHERE source=?1",
                    [key.as_ref()],
                    |row| Ok((row.get::<_, bool>(0)?, row.get::<_, String>(1)?)),
                )
                .map_err(err)?;
            if after.is_empty() {
                pending += 1;
            }
            if failed {
                errors += 1;
            }
        }
    }
    Ok(json!({"processed":processed,"pending":pending,"errors":errors}))
}

pub fn scan(db: &mut Connection) -> Result<Value, String> {
    registry::scan(db)
}

pub fn rebuild(db: &mut Connection) -> Result<(), String> {
    db.execute("DELETE FROM insight_checkpoints", [])
        .map_err(err)?;
    Ok(())
}

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct Filter {
    from: Option<i64>,
    until: Option<i64>,
    project: String,
    provider: String,
    confidence: String,
    category: String,
    name: String,
    server: String,
    trigger: String,
    outcome: String,
    confirmed_only: bool,
    offset: i64,
}

pub fn dashboard(db: &Connection, f: Filter) -> Result<Value, String> {
    let filter=" WHERE (?1 IS NULL OR time>=?1) AND (?2 IS NULL OR time<?2)
        AND (?3='' OR project=?3) AND (?4='' OR provider=?4) AND (?5='' OR confidence=?5)
        AND (?6='' OR category=?6) AND (?7='' OR name=?7) AND (?8='' OR server=?8) AND (?9='' OR trigger=?9)
        AND (?10='' OR outcome=?10 OR (?10='failed' AND outcome IN ('failure','declined')))
        AND (?11=0 OR trigger<>'candidate')";
    let arguments = params![
        f.from,
        f.until,
        f.project,
        f.provider,
        f.confidence,
        f.category,
        f.name,
        f.server,
        f.trigger,
        f.outcome,
        f.confirmed_only
    ];
    let mut q=db.prepare(&format!("SELECT category,name,server,trigger,outcome,count(*),count(distinct source),count(distinct nullif(project,'')),max(time),sum(duration),count(duration) FROM insight_unique{filter} GROUP BY category,name,server,trigger,outcome")).map_err(err)?;
    let groups=q.query_map(arguments,|r|Ok(json!({"category":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"server":r.get::<_,String>(2)?,
        "trigger":r.get::<_,String>(3)?,"outcome":r.get::<_,String>(4)?,"count":r.get::<_,i64>(5)?,"sessions":r.get::<_,i64>(6)?,
        "projects":r.get::<_,i64>(7)?,"latest":r.get::<_,Option<i64>>(8)?,"durationSum":r.get::<_,Option<i64>>(9)?,"durationCount":r.get::<_,i64>(10)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    let mut q=db.prepare(&format!("SELECT time/86400,category,trigger,outcome,server,count(*) FROM insight_unique{filter} AND time IS NOT NULL GROUP BY 1,2,3,4,5 ORDER BY 1")).map_err(err)?;
    let days = q
        .query_map(arguments, |r| {
            Ok(json!([
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?
            ]))
        })
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    let mut q=db.prepare(&format!("SELECT source,category,name,server,trigger,confidence,time,project,provider,turn,outcome,duration,evidence FROM insight_unique{filter} ORDER BY time DESC,source,identity LIMIT 50 OFFSET {}",f.offset.max(0))).map_err(err)?;
    let activity=q.query_map(arguments,|r|{
        let raw:String=r.get(12)?;
        Ok(json!({"source":r.get::<_,String>(0)?,"category":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?,"server":r.get::<_,String>(3)?,
        "trigger":r.get::<_,String>(4)?,"confidence":r.get::<_,String>(5)?,"time":r.get::<_,Option<i64>>(6)?,"project":r.get::<_,String>(7)?,
        "provider":r.get::<_,String>(8)?,"turn":r.get::<_,String>(9)?,"outcome":r.get::<_,String>(10)?,"duration":r.get::<_,Option<i64>>(11)?,"evidence":serde_json::from_str::<Value>(&raw).unwrap_or_default()}))
    }).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    let mut q = db
        .prepare("SELECT DISTINCT project FROM insight_calls WHERE project<>'' ORDER BY project")
        .map_err(err)?;
    let projects = q
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    let related_projects = if !f.server.is_empty() || !f.name.is_empty() {
        let mut q = db.prepare(&format!("SELECT project,count(*) FROM insight_unique{filter}
            AND project<>'' AND trigger<>'candidate' GROUP BY project ORDER BY count(*) DESC,project")).map_err(err)?;
        let rows = q
            .query_map(arguments, |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            })
            .map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)?
    } else {
        Vec::new()
    };
    let coverage=db.query_row("SELECT count(CASE WHEN indexed_at>0 AND failed=0 THEN 1 END),max(nullif(indexed_at,0)),coalesce(sum(errors),0),coalesce(sum(failed),0),min(CASE WHEN indexed_at>0 AND failed=0 THEN first_time END),max(CASE WHEN indexed_at>0 AND failed=0 THEN last_time END) FROM insight_checkpoints",[],|r|
        Ok(json!({"sessions":r.get::<_,i64>(0)?,"lastIndex":r.get::<_,Option<i64>>(1)?,"parseErrors":r.get::<_,i64>(2)?,"failed":r.get::<_,i64>(3)?,"first":r.get::<_,Option<i64>>(4)?,"last":r.get::<_,Option<i64>>(5)?}))).map_err(err)?;
    let mut q=db.prepare(&format!("SELECT category,name,server,count(distinct source),count(distinct nullif(project,'')) FROM insight_unique{filter} AND trigger<>'candidate' GROUP BY category,name,server")).map_err(err)?;
    let reach = q
        .query_map(arguments, |r| {
            Ok(json!([
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?
            ]))
        })
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    let correlations = if f.server.is_empty() {
        Vec::new()
    } else {
        let mut query=db.prepare(&format!(
            "WITH selected AS (SELECT * FROM insight_unique{filter})
             SELECT peer.category,peer.name,peer.server,count(DISTINCT json_array(s.provider,s.session_id,s.turn))
             FROM selected s JOIN insight_unique peer ON peer.provider=s.provider AND peer.session_id=s.session_id AND peer.turn=s.turn
             WHERE s.turn<>'' AND peer.category<>s.category AND s.trigger<>'candidate' AND peer.trigger<>'candidate'
             GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 12"
        )).map_err(err)?;
        let rows = query
            .query_map(arguments, |r| {
                Ok(json!([
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?
                ]))
            })
            .map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let lifecycle = if f.confidence.is_empty()
        && f.category.is_empty()
        && (f.provider.is_empty() || f.provider == "Codex")
    {
        let mut q=db.prepare("SELECT 'version',v.path,s.name,s.project,v.hash,v.first_seen
             FROM insight_versions v JOIN insight_skills s ON s.path=v.path
             WHERE (?1 IS NULL OR v.first_seen>=?1) AND (?2 IS NULL OR v.first_seen<?2) AND (?3='' OR s.project=?3)
             UNION ALL SELECT 'feedback',f.subject,f.category,coalesce(c.cwd,s.cwd,''),'',f.created
             FROM insight_feedback f LEFT JOIN catalog c ON c.path=f.source LEFT JOIN sources s ON s.path=f.source
             WHERE (?1 IS NULL OR f.created>=?1) AND (?2 IS NULL OR f.created<?2) AND (?3='' OR coalesce(c.cwd,s.cwd,'')=?3)
             ORDER BY 6 DESC LIMIT 20").map_err(err)?;
        let rows=q.query_map(params![f.from,f.until,f.project],|r|Ok(json!({"kind":r.get::<_,String>(0)?,"path":r.get::<_,String>(1)?,
            "name":r.get::<_,String>(2)?,"project":r.get::<_,String>(3)?,"version":r.get::<_,String>(4)?,"time":r.get::<_,i64>(5)?}))).map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)?
    } else {
        Vec::new()
    };
    Ok(
        json!({"groups":groups,"days":days,"activity":activity,"projects":projects,"relatedProjects":related_projects,"coverage":coverage,"reach":reach,"correlations":correlations,"lifecycle":lifecycle,
        "skills":registry::skills(db)?,"servers":registry::servers(db)?}),
    )
}

pub fn versions(db: &Connection, path: &str) -> Result<Value, String> {
    registry::versions(db, path)
}

pub fn feedback(db: &Connection, action: &str, item: Value) -> Result<Value, String> {
    let id = item["id"].as_i64().unwrap_or_default();
    match action {
        "save" => {
            let body = s(&item, "body").trim();
            if body.is_empty() || body.len() > 32768 {
                return Err("Feedback must contain 1–32768 UTF-8 bytes.".into());
            }
            let category = s(&item, "category");
            let status = s(&item, "status");
            if !["issue", "correction", "requirement", "experience", "rule"].contains(&category)
                || !["open", "reviewed", "resolved"].contains(&status)
            {
                return Err("Unknown feedback category or status.".into());
            }
            if id > 0 {
                db.execute("UPDATE insight_feedback SET category=?1,body=?2,status=?3,updated=?4 WHERE id=?5",params![category,body,status,now(),id]).map_err(err)?;
            } else {
                db.execute("INSERT INTO insight_feedback(subject,source,turn,offset,version,category,body,status,created,updated) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
                    params![s(&item,"subject"),s(&item,"source"),s(&item,"turn"),item["offset"].as_i64(),item["version"].as_str(),category,body,status,now()]).map_err(err)?;
            }
        }
        "delete" => {
            db.execute("DELETE FROM insight_feedback WHERE id=?1", [id])
                .map_err(err)?;
        }
        "list" => {}
        _ => return Err("Unsupported feedback action.".into()),
    }
    let mut q=db.prepare("SELECT id,subject,source,turn,offset,version,category,body,status,created,updated FROM insight_feedback ORDER BY updated DESC,id DESC").map_err(err)?;
    let rows=q.query_map([],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"subject":r.get::<_,String>(1)?,"source":r.get::<_,String>(2)?,
      "turn":r.get::<_,String>(3)?,"offset":r.get::<_,Option<i64>>(4)?,"version":r.get::<_,Option<String>>(5)?,
      "category":r.get::<_,String>(6)?,"body":r.get::<_,String>(7)?,"status":r.get::<_,String>(8)?,"created":r.get::<_,i64>(9)?,"updated":r.get::<_,i64>(10)?}))).map_err(err)?.collect::<Result<Vec<_>,_>>().map_err(err)?;
    Ok(json!(rows))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, io::Write};

    fn user(text: &str, kind: &str, turn: &str) -> Value {
        json!({"type":"response_item","timestamp":"2026-11-25T01:00:00Z","payload":{"type":"message","role":"user",
            "content":[{"text":text}],"internal_chat_message_metadata_passthrough":{"turn_id":turn,"content_item_kinds":[kind]}}})
    }
    #[test]
    fn history_deduplicates_skill_evidence_and_mcp_results_across_rollout_copies() {
        let root = tempfile::tempdir().unwrap();
        let first = root.path().join("rollout-first.jsonl");
        let copy = root.path().join("rollout-copy.jsonl");
        let records = [
            json!({"type":"session_meta","payload":{"id":"test-session","cwd":"/test/project"}}),
            user(
                "[$review](/example/review/SKILL.md)\nReview it.",
                "user.text",
                "turn-1",
            ),
            user(
                "<skill>\n<name>review</name>\n<path>/example/review/SKILL.md</path>\n</skill>",
                "skills.selected_skill_instructions",
                "turn-1",
            ),
            user(
                "<skill>\n<name>review</name>\n<path>/other/review/SKILL.md</path>\n</skill>",
                "skills.selected_skill_instructions",
                "turn-1",
            ),
            user(
                "Instructions list: [$ignored](/example/catalog/SKILL.md)",
                "agents_md.instructions",
                "turn-1",
            ),
            json!({"type":"response_item","timestamp":"2026-11-25T01:00:01Z","payload":{"type":"function_call","name":"read","namespace":"mcp__alpha",
              "call_id":"call-1","arguments":"{\"authorization\":\"sensitive-fixture\"}","internal_chat_message_metadata_passthrough":{"turn_id":"turn-1"}}}),
            json!({"type":"response_item","timestamp":"2026-11-25T01:00:02Z","payload":{"type":"function_call","name":"read","namespace":"mcp__beta",
              "call_id":"call-2","arguments":"{}","internal_chat_message_metadata_passthrough":{"turn_id":"turn-1"}}}),
            json!({"type":"event_msg","timestamp":"2026-11-25T01:00:03Z","payload":{"type":"item_completed","turn_id":"turn-1","item":
              {"type":"McpToolCall","id":"call-1","server":"alpha","tool":"read","status":"completed","result":{"isError":true},"duration":{"secs":1,"nanos":500000000}}}}),
            json!({"type":"event_msg","timestamp":"2026-11-25T01:00:03Z","payload":{"type":"additional_tools","tools":[{"name":"mcp__alpha__not_invoked"}]}}),
            json!({"type":"response_item","timestamp":"2026-11-25T01:00:04Z","payload":{"type":"function_call","name":"exec_command","call_id":"call-3",
              "arguments":"{\"cmd\":\"cat /sample/read-only/SKILL.md\"}","internal_chat_message_metadata_passthrough":{"turn_id":"turn-1"}}}),
        ];
        let body = records
            .iter()
            .map(Value::to_string)
            .collect::<Vec<_>>()
            .join("\n")
            + "\ninvalid\n";
        fs::write(&first, &body).unwrap();
        fs::write(&copy, &body).unwrap();
        let mut db = super::super::open(&root.path().join("db.sqlite3")).unwrap();
        for path in [&first, &copy, &first] {
            ingest_batch(&mut db, path, Provider::Codex, None).unwrap();
        }
        let data = dashboard(&db, Filter::default()).unwrap();
        assert_eq!(data["activity"].as_array().unwrap().len(), 5);
        assert_eq!(data["coverage"]["parseErrors"], 2);
        let explicit = dashboard(
            &db,
            Filter {
                trigger: "explicit".into(),
                project: "/test/project".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(explicit["activity"].as_array().unwrap().len(), 1);
        assert_eq!(
            explicit["activity"][0]["evidence"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let failure = dashboard(
            &db,
            Filter {
                outcome: "failed".into(),
                category: "mcp".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(failure["activity"].as_array().unwrap().len(), 1);
        assert_eq!(failure["activity"][0]["duration"], 1500);
        assert!(!failure.to_string().contains("sensitive-fixture"));
        assert_eq!(
            failure["activity"][0]["evidence"][0]["arguments"]["shape"]["fields"],
            1
        );
        let peers = dashboard(
            &db,
            Filter {
                server: "alpha".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(peers["correlations"].as_array().unwrap().len(), 2);
        let window = dashboard(
            &db,
            Filter {
                until: Some(1),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(window["activity"].as_array().unwrap().is_empty());
        let mut append = fs::OpenOptions::new().append(true).open(&first).unwrap();
        let trailing = user("[$later](/example/later/SKILL.md)", "user.text", "turn-2").to_string();
        write!(append, "{trailing}").unwrap();
        ingest_batch(&mut db, &first, Provider::Codex, None).unwrap();
        assert_eq!(
            dashboard(&db, Filter::default()).unwrap()["activity"]
                .as_array()
                .unwrap()
                .len(),
            5
        );
        writeln!(append).unwrap();
        ingest_batch(&mut db, &first, Provider::Codex, None).unwrap();
        assert_eq!(
            dashboard(&db, Filter::default()).unwrap()["activity"]
                .as_array()
                .unwrap()
                .len(),
            6
        );
    }

    #[test]
    fn bounded_index_can_resume_large_sources_without_duplicate_observations() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("rollout-large.jsonl");
        let records = (0..120)
            .map(|i| {
                user(
                    "[$example](/example/skill/SKILL.md)",
                    "user.text",
                    &i.to_string(),
                )
                .to_string()
            })
            .collect::<Vec<_>>();
        fs::write(&path, records.join("\n") + "\n").unwrap();
        let mut db = super::super::open(&tmp.path().join("db.sqlite3")).unwrap();
        for _ in 0..20 {
            ingest_batch(&mut db, &path, Provider::Codex, Some(2_048)).unwrap();
            let covered: bool = db
                .query_row("SELECT stamp<>'' FROM insight_checkpoints", [], |r| {
                    r.get(0)
                })
                .unwrap();
            if covered {
                break;
            }
        }
        for _ in 0..2 {
            ingest_batch(&mut db, &path, Provider::Codex, Some(2_048)).unwrap();
        }
        let total: i64 = db
            .query_row("SELECT count(*) FROM insight_calls", [], |r| r.get(0))
            .unwrap();
        assert_eq!(total, 120);
    }

    #[test]
    fn feedback_can_be_edited_and_deleted_without_losing_its_evidence() {
        let db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap();
        let rows=feedback(&db,"save",json!({"subject":"skill","source":"rollout","turn":"one","offset":123,"category":"issue","status":"open","body":"feedback"})).unwrap();
        let id = rows[0]["id"].clone();
        let edited = feedback(
            &db,
            "save",
            json!({"id":id,"category":"issue","status":"reviewed","body":"edited"}),
        )
        .unwrap();
        assert_eq!(edited[0]["offset"], 123);
        assert_eq!(edited[0]["status"], "reviewed");
        assert_eq!(
            feedback(&db, "delete", json!({"id":id})).unwrap(),
            json!([])
        );
    }

    #[test]
    #[ignore = "Locally verify full historical batch indexing without printing records"]
    fn real_local_full_index() {
        let root = tempfile::tempdir().unwrap();
        let mut db = super::super::open(&root.path().join("db.sqlite3")).unwrap();
        let started = std::time::Instant::now();
        let mut batches = 0;
        loop {
            let state = index(&mut db, 8).unwrap();
            batches += 1;
            assert!(batches < 100);
            if state["pending"] == 0 {
                break;
            }
        }
        let second = index(&mut db, 8).unwrap();
        assert_eq!(second["processed"], 0);
        let data = dashboard(&db, Filter::default()).unwrap();
        assert_eq!(data["coverage"]["failed"], 0);
        println!(
            "sources={} parse_errors={} batches={batches} elapsed_ms={}",
            data["coverage"]["sessions"],
            data["coverage"]["parseErrors"],
            started.elapsed().as_millis()
        );
    }

    #[test]
    #[ignore = "Locally verify real logs without printing their contents"]
    fn real_local_insights_smoke() {
        let root = tempfile::tempdir().unwrap();
        let mut db = super::super::open(&root.path().join("db.sqlite3")).unwrap();
        let mut recent = files(&[])
            .into_iter()
            .filter(|(path, (provider, _))| {
                *provider == Provider::Codex
                    && path.metadata().is_ok_and(|m| m.len() < 8 * 1024 * 1024)
            })
            .collect::<Vec<_>>();
        recent.sort_by_cached_key(|(path, _)| {
            std::cmp::Reverse(path.metadata().and_then(|m| m.modified()).ok())
        });
        let mut sources = 0;
        for (path, _) in recent.iter().take(36) {
            ingest_batch(&mut db, path, Provider::Codex, None).unwrap();
            sources += 1;
        }
        scan(&mut db).unwrap();
        let data = dashboard(&db, Filter::default()).unwrap();
        let groups = data["groups"].as_array().unwrap();
        let counted = |category: &str, trigger: &str| {
            groups
                .iter()
                .filter(|r| {
                    r["category"] == category && (trigger.is_empty() || r["trigger"] == trigger)
                })
                .map(|r| r["count"].as_u64().unwrap_or(0))
                .sum::<u64>()
        };
        assert_eq!(data["coverage"]["failed"], 0);
        println!("sources={sources} skills={} explicit={} unknown={} candidates={} mcp={} configured_servers={} parse_errors={}",
          data["skills"].as_array().unwrap().len(),counted("skill","explicit"),counted("skill","unknown"),counted("skill","candidate"),
          counted("mcp",""),data["servers"].as_array().unwrap().len(),data["coverage"]["parseErrors"]);
    }
}
