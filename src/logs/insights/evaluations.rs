use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::{err, s};

const PAGE_SIZE: i64 = 20;
const MAX_BUNDLE: usize = 100;
const MAX_FIELD: usize = 8_000;

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS insight_eval_cases (
         id TEXT PRIMARY KEY, sample TEXT NOT NULL, expectation TEXT, checks TEXT NOT NULL DEFAULT '',
         split TEXT NOT NULL DEFAULT 'development');",
    )
}

pub fn candidates(db: &Connection, input: &Value) -> Result<Value, String> {
    let path = s(input, "path");
    let name = s(input, "name");
    if path.is_empty() && name.is_empty() {
        return Err("A skill identity is required.".into());
    }
    let offset = input["offset"].as_i64().unwrap_or_default().max(0);
    let mut query = db.prepare(
        "SELECT source,identity,session_id,turn,name,trigger,provider,time,evidence FROM insight_unique
         WHERE category='skill' AND trigger<>'candidate'
          AND ((?1<>'' AND server=?1) OR (?1='' AND server='' AND name=?2))
         ORDER BY time DESC,source,identity LIMIT ?3 OFFSET ?4",
    ).map_err(err)?;
    let mut rows = query
        .query(params![path, name, PAGE_SIZE + 1, offset])
        .map_err(err)?;
    let mut items = Vec::new();
    while let Some(row) = rows.next().map_err(err)? {
        let source: String = row.get(0).map_err(err)?;
        let identity: String = row.get(1).map_err(err)?;
        let session: String = row.get(2).map_err(err)?;
        let turn: String = row.get(3).map_err(err)?;
        let name: String = row.get(4).map_err(err)?;
        let trigger: String = row.get(5).map_err(err)?;
        let provider: String = row.get(6).map_err(err)?;
        let time: Option<i64> = row.get(7).map_err(err)?;
        let proof: Vec<Value> =
            serde_json::from_str(&row.get::<_, String>(8).map_err(err)?).map_err(err)?;
        let first = proof.iter().find_map(|entry| entry["byteOffset"].as_i64());
        let id = digest(&(provider.as_str(), session.as_str(), identity.as_str()))?;
        let group = digest(&(provider.as_str(), session.as_str()))?;
        let shared: bool = !turn.is_empty() && db.query_row(
            "SELECT EXISTS(SELECT 1 FROM insight_unique WHERE category='skill' AND trigger<>'candidate'
             AND provider=?1 AND session_id=?2 AND turn=?3 AND identity<>?4)",
            params![provider,session,turn,identity], |row| row.get(0),
        ).map_err(err)?;
        let (prompt, notes) = preview(db, &source, &turn, first)?;
        items.push(json!({"id":id,"group":group,"skill":name,"trigger":trigger,"provider":provider,
            "time":time,"source":source,"turn":turn,"offset":first,"prompt":prompt,"notes":notes,"shared":shared,
            "proof":proof.iter().filter_map(|item|item["kind"].as_str()).collect::<Vec<_>>()}));
    }
    let more = items.len() > PAGE_SIZE as usize;
    items.truncate(PAGE_SIZE as usize);
    Ok(json!({"items":items,"more":more,"offset":offset}))
}

fn digest(value: &impl Serialize) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(err)?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn preview(
    db: &Connection,
    source: &str,
    turn: &str,
    offset: Option<i64>,
) -> Result<(String, Vec<Value>), String> {
    let mut query = db
        .prepare(
            "SELECT body FROM events WHERE path=?1 AND
          ((?2<>'' AND json_extract(body,'$.turnId')=?2) OR (?2='' AND ordinal=?3)) AND
          json_extract(body,'$.event') IN ('message','call','evidence','result','diagnostic')
          ORDER BY ordinal,sub LIMIT 100",
        )
        .map_err(err)?;
    let rows = query
        .query_map(params![source, turn, offset], |row| row.get::<_, String>(0))
        .map_err(err)?;
    let mut prompt = String::new();
    let mut notes = Vec::new();
    for row in rows {
        let event: Value = serde_json::from_str(&row.map_err(err)?).map_err(err)?;
        if s(&event, "event") == "message" && s(&event, "role") == "user" {
            // Codex's normalized message can also include injected instructions.
            let text = s(&event, "content")
                .split("<skill>")
                .next()
                .unwrap_or_default()
                .trim();
            if !text.is_empty() && !text.starts_with('#') && !text.starts_with("<") {
                if prompt.is_empty() {
                    prompt = text.chars().take(1800).collect();
                } else if notes.len() < 8 {
                    notes.push(
                        json!({"kind":"user","text":text.chars().take(360).collect::<String>()}),
                    );
                }
            }
        } else if notes.len() < 8
            && (!s(&event, "tool").is_empty()
                || event["failed"] == true
                || event["exit"].is_number())
        {
            notes.push(json!({"kind":"tool","text":s(&event,"tool"),"failed":event["failed"],"exit":event["exit"]}));
        }
    }
    Ok((prompt, notes))
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Sample {
    id: String,
    group: String,
    skill: String,
    package: String,
    input: String,
    observed: String,
    trigger: String,
}

impl Sample {
    fn validate(&self) -> Result<(), String> {
        let hash = |s: &str| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit());
        if !hash(&self.id)
            || !hash(&self.group)
            || self.skill.trim().is_empty()
            || self.skill.len() > 256
            || self.package.len() > 512
            || self.input.trim().is_empty()
            || self.input.len() > MAX_FIELD
            || self.observed.len() > MAX_FIELD
            || !matches!(self.trigger.as_str(), "explicit" | "implicit" | "unknown")
        {
            return Err("A case has invalid fields or exceeds export limits.".into());
        }
        Ok(())
    }
}

fn portable(input: &Value) -> Result<Vec<Sample>, String> {
    if input["format"] != "agentlens-eval-cases" || input["version"] != 1 {
        return Err("Unsupported evaluation bundle.".into());
    }
    let cases = input["cases"]
        .as_array()
        .ok_or("An evaluation bundle must include a case list.")?;
    if cases.is_empty() || cases.len() > MAX_BUNDLE {
        return Err("Select 1–100 evaluation cases.".into());
    }
    cases
        .iter()
        .map(|item| {
            let sample: Sample = serde_json::from_value(item.clone()).map_err(err)?;
            sample.validate()?;
            Ok(sample)
        })
        .collect()
}

pub fn bundle(input: &Value) -> Result<Value, String> {
    Ok(json!({"format":"agentlens-eval-cases","version":1,"cases":portable(input)?}))
}

pub fn library(db: &mut Connection, action: &str, input: &Value) -> Result<Value, String> {
    match action {
        "import" => {
            let samples = portable(input)?;
            let tx = db.transaction().map_err(err)?;
            let mut inserted = 0;
            for item in samples {
                inserted += tx
                    .execute(
                        "INSERT OR IGNORE INTO insight_eval_cases(id,sample) VALUES (?1,?2)",
                        params![item.id, serde_json::to_string(&item).map_err(err)?],
                    )
                    .map_err(err)?;
            }
            tx.commit().map_err(err)?;
            return Ok(json!({"inserted":inserted}));
        }
        "review" => {
            let id = s(input, "id");
            let expectation = s(input, "expectation");
            let checks = s(input, "checks").trim();
            let split = s(input, "split");
            if !matches!(expectation, "trigger" | "skip" | "uncertain")
                || !matches!(split, "development" | "holdout")
                || checks.len() > MAX_FIELD
                || (expectation != "uncertain" && checks.is_empty())
                || (split == "holdout" && expectation == "uncertain")
            {
                return Err(
                    "Provide an expected trigger and checks before approving a case.".into(),
                );
            }
            let tx = db.transaction().map_err(err)?;
            let raw: String = tx
                .query_row(
                    "SELECT sample FROM insight_eval_cases WHERE id=?1",
                    [id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?
                .ok_or("Evaluation case was not found.")?;
            let sample: Sample = serde_json::from_str(&raw).map_err(err)?;
            let conflict:bool=tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM insight_eval_cases WHERE id<>?1 AND expectation IN('trigger','skip')
                 AND split<>?2 AND (json_extract(sample,'$.group')=?3 OR
                 (json_extract(sample,'$.skill')=?4 AND lower(trim(json_extract(sample,'$.input')))=lower(trim(?5)))))",
                params![id,split,sample.group,sample.skill,sample.input],|r|r.get(0)).map_err(err)?;
            if expectation != "uncertain" && conflict {
                return Err("Related cases must use the same dataset split.".into());
            }
            tx.execute(
                "UPDATE insight_eval_cases SET expectation=?2,checks=?3,split=?4 WHERE id=?1",
                params![id, expectation, checks, split],
            )
            .map_err(err)?;
            tx.commit().map_err(err)?;
        }
        "list" | "dataset" => {}
        _ => return Err("Unsupported evaluation action.".into()),
    }
    let mut q = db
        .prepare(
            "SELECT sample,expectation,checks,split FROM insight_eval_cases ORDER BY rowid DESC",
        )
        .map_err(err)?;
    let rows = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(err)?;
    let mut items = Vec::new();
    for row in rows {
        let (raw, expectation, checks, split) = row.map_err(err)?;
        let item: Sample = serde_json::from_str(&raw).map_err(err)?;
        if action == "dataset" {
            if split != s(input, "split")
                || item.skill != s(input, "skill")
                || item.package != s(input, "package")
            {
                continue;
            }
            let Some(expectation @ ("trigger" | "skip")) = expectation.as_deref() else {
                continue;
            };
            items.push(json!({"id":item.id,"query":item.input,"should_trigger":expectation=="trigger","checks":checks,"source":"reviewed_session"}));
        } else {
            items.push(
                json!({"sample":item,"expectation":expectation,"checks":checks,"split":split}),
            );
        }
    }
    if action == "dataset" {
        return Ok(json!({"format":"agentlens-eval-dataset","version":1,
        "skill":s(input,"skill"),"package":s(input,"package"),"split":s(input,"split"),"cases":items}));
    }
    Ok(json!(items))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidate_list_matches_exact_skill_and_turn() {
        let db = Connection::open_in_memory().unwrap();
        super::super::super::migrate(&db).unwrap();
        for (identity, path, trigger, turn) in [
            ("a", "/work/a/report/SKILL.md", "explicit", "turn-1"),
            ("b", "/work/b/report/SKILL.md", "unknown", "turn-1"),
            ("c", "/work/a/report/SKILL.md", "candidate", "turn-2"),
        ] {
            db.execute(
                "INSERT INTO insight_calls VALUES ('rollout',?1,'session','skill','report',?2,?3,'high',1,'','Codex',?4,'unknown',NULL,'[]')",
                params![identity,path,trigger,turn],
            ).unwrap();
        }
        for (offset, turn, text) in [
            (1, "turn-1", "Prepare a report"),
            (2, "turn-2", "Unrelated private prompt"),
        ] {
            db.execute(
                "INSERT INTO events VALUES('rollout',?1,0,?2)",
                params![
                    offset,
                    json!({"event":"message","role":"user","turnId":turn,"content":text})
                        .to_string()
                ],
            )
            .unwrap();
        }
        let result = candidates(
            &db,
            &json!({"path":"/work/a/report/SKILL.md","name":"report"}),
        )
        .unwrap();
        let cases = result["items"].as_array().unwrap();
        assert_eq!(cases.len(), 1);
        assert_eq!(cases[0]["prompt"], "Prepare a report");
        assert_eq!(cases[0]["shared"], true);
    }

    #[test]
    fn export_keeps_only_reviewed_cases_and_prevents_split_leakage() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap();
        let id = "a".repeat(64);
        let related = "b".repeat(64);
        let group = "c".repeat(64);
        let sample = |id: &str| {
            json!({"id":id,"group":group,"skill":"report","package":"example/report",
            "input":"Generate a summary","observed":"one column missing","trigger":"explicit"})
        };
        let payload = json!({"format":"agentlens-eval-cases","version":1,"cases":[sample(&id),sample(&related)]});
        assert_eq!(library(&mut db, "import", &payload).unwrap()["inserted"], 2);
        assert_eq!(library(&mut db, "import", &payload).unwrap()["inserted"], 0);
        let dataset = json!({"skill":"report","package":"example/report","split":"holdout"});
        assert_eq!(
            library(&mut db, "dataset", &dataset).unwrap()["cases"],
            json!([])
        );
        library(&mut db,"review",&json!({"id":id,"expectation":"trigger","checks":"Includes all required columns","split":"holdout"})).unwrap();
        let case = &library(&mut db, "dataset", &dataset).unwrap()["cases"][0];
        assert_eq!(case["should_trigger"], true);
        assert!(case.get("observed").is_none());
        assert!(library(&mut db,"review",&json!({"id":related,"expectation":"skip","checks":"Does not generate a report","split":"development"})).is_err());
    }
}
