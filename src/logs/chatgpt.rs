use super::Session;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::{collections::HashSet, fs::File, io::BufReader, path::PathBuf};

const PREFIX: &str = "chatgpt-export:";

pub(super) fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS chatgpt_imports (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            updated_ms INTEGER NOT NULL,
            steps TEXT NOT NULL
        );",
    )
}

fn milliseconds(value: &Value) -> Option<i64> {
    match value.as_f64() {
        Some(seconds) if seconds.is_finite() && (0.0..=8.64e12).contains(&seconds) => {
            Some((seconds * 1000.0).round() as i64)
        }
        _ => None,
    }
}

fn steps(chat: &Value) -> Option<Vec<Value>> {
    let mapping = chat["mapping"].as_object()?;
    let mut id = chat["current_node"].as_str().or_else(|| {
        mapping
            .iter()
            .filter(|(_, node)| node["children"].as_array().is_none_or(Vec::is_empty))
            .max_by_key(|(_, node)| milliseconds(&node["message"]["create_time"]))
            .map(|(id, _)| id.as_str())
    })?;
    let mut visited = HashSet::new();
    let mut branch = Vec::new();
    loop {
        if !visited.insert(id) {
            return None;
        }
        let node = mapping.get(id)?;
        branch.push(&node["message"]);
        match node["parent"].as_str() {
            Some(parent) => id = parent,
            None => break,
        }
    }
    let mut result = Vec::new();
    let mut round = 0;
    for message in branch.into_iter().rev() {
        let role = message["author"]["role"].as_str().unwrap_or_default();
        if !matches!(role, "user" | "assistant")
            || message["metadata"]["is_visually_hidden_from_conversation"] == true
            || (role == "assistant" && message["recipient"].as_str().is_some_and(|r| r != "all"))
        {
            continue;
        }
        let content = &message["content"];
        if !matches!(
            content["content_type"].as_str(),
            Some("text" | "multimodal_text")
        ) {
            continue;
        }
        let text = content["parts"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("\n");
        if text.trim().is_empty() {
            continue;
        }
        if role == "user" {
            round += 1;
        }
        result.push(json!({
            "id":result.len()+1,"round":round.max(1),"kind":"消息","role":role,
            "title":text.chars().take(110).collect::<String>(),"content":text,
            "state":"已记录","time":milliseconds(&message["create_time"])
        }));
    }
    Some(result)
}

pub fn import(db: &mut Connection, paths: &[PathBuf]) -> Result<usize, String> {
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let mut ids = HashSet::new();
    for path in paths {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let value: Value = serde_json::from_reader(BufReader::new(file))
            .map_err(|e| format!("Invalid conversation JSON: {e}"))?;
        let chats = value
            .as_array()
            .ok_or("Choose a ChatGPT conversation JSON file from the extracted export.")?;
        for chat in chats {
            let Some(id) = chat["conversation_id"]
                .as_str()
                .or_else(|| chat["id"].as_str())
                .filter(|id| !id.is_empty())
            else {
                continue;
            };
            let Some(steps) = steps(chat).filter(|steps| !steps.is_empty()) else {
                continue;
            };
            let updated = milliseconds(&chat["update_time"])
                .or_else(|| milliseconds(&chat["create_time"]))
                .unwrap_or_default();
            tx.execute(
                "INSERT INTO chatgpt_imports VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_ms=excluded.updated_ms, steps=excluded.steps
                 WHERE excluded.updated_ms >= chatgpt_imports.updated_ms",
                params![id,chat["title"].as_str().unwrap_or_default(),updated,json!(steps).to_string()],
            ).map_err(|e|e.to_string())?;
            ids.insert(id.to_owned());
        }
    }
    if ids.is_empty() {
        return Err("No supported conversations with visible text were found.".into());
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ids.len())
}

pub(super) fn list(db: &Connection) -> rusqlite::Result<Vec<Session>> {
    let mut statement = db.prepare("SELECT id,title,updated_ms FROM chatgpt_imports")?;
    let rows = statement.query_map([], |row| {
        Ok(Session {
            key: format!("{PREFIX}{}", row.get::<_, String>(0)?),
            provider: "ChatGPT",
            project: "ChatGPT".into(),
            project_key: PREFIX.into(),
            project_order: None,
            title: row.get(1)?,
            modified: row.get::<_, i64>(2)?.max(0) as u64 / 1000,
            archived: false,
        })
    })?;
    rows.collect()
}

pub(super) fn session(db: &Connection, key: &str) -> Result<Option<Value>, String> {
    let Some(id) = key.strip_prefix(PREFIX) else {
        return Ok(None);
    };
    let body = db
        .query_row(
            "SELECT steps FROM chatgpt_imports WHERE id=?1",
            [id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("Imported conversation not found.")?;
    let steps: Vec<Value> = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    Ok(Some(
        json!({"eventCount":steps.len(),"steps":steps,"usage":null,"model":null}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_selected_branch_and_keeps_only_visible_text() {
        let visible = |role: &str, text: &str| {
            json!({
                "author":{"role":role},"content":{"content_type":"text","parts":[text]},
                "recipient":"all","create_time":1.25
            })
        };
        let chat = json!({"current_node":"a","mapping":{
            "u":{"message":visible("user","Question")},
            "a":{"parent":"u","message":visible("assistant","Answer")},
            "b":{"parent":"u","message":visible("assistant","Alternate branch")}
        }});
        let result = steps(&chat).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[1]["content"], "Answer");
        assert_eq!(result[1]["time"], 1250);
    }
}
