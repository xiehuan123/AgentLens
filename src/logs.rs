use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{BufRead, BufReader, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Provider {
    Codex,
    Claude,
}

impl Provider {
    fn name(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::Claude => "Claude Code",
        }
    }
}

#[derive(Serialize)]
pub struct Session {
    key: String,
    provider: &'static str,
    project: String,
    title: String,
    modified: u64,
    archived: bool,
}

fn walk(
    path: &Path,
    provider: Provider,
    archived: bool,
    found: &mut BTreeMap<PathBuf, (Provider, bool)>,
) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if kind.is_dir() {
            walk(&path, provider, archived, found);
        } else if kind.is_file()
            && path.extension().is_some_and(|ext| ext == "jsonl")
            && (provider == Provider::Claude
                || entry.file_name().to_string_lossy().starts_with("rollout-"))
        {
            found.entry(path).or_insert((provider, archived));
        }
    }
}

fn roots() -> Vec<(PathBuf, Provider, bool)> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    let codex = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    vec![
        (codex.join("sessions"), Provider::Codex, false),
        (codex.join("archived_sessions"), Provider::Codex, true),
    ]
}

fn files(extra: &[(PathBuf, Provider)]) -> BTreeMap<PathBuf, (Provider, bool)> {
    let mut found = BTreeMap::new();
    for (path, provider, archived) in roots().into_iter().chain(
        extra
            .iter()
            .map(|(path, provider)| (path.clone(), *provider, false)),
    ) {
        walk(&path, provider, archived, &mut found);
    }
    found
}

pub fn list(db: &Connection, extra: &[(PathBuf, Provider)]) -> Vec<Session> {
    let mut result = Vec::new();
    for (path, (provider, archived)) in files(extra) {
        let key = path.to_string_lossy().into_owned();
        let modified = path
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or_default();
        let cwd: Option<String> = db
            .query_row("SELECT cwd FROM sources WHERE path=?1", [&key], |row| {
                row.get(0)
            })
            .ok();
        let project = cwd
            .as_deref()
            .filter(|cwd| !cwd.is_empty())
            .and_then(|cwd| Path::new(cwd).file_name())
            .or_else(|| path.parent().and_then(Path::file_name))
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let title = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        result.push(Session {
            key,
            provider: provider.name(),
            project,
            title,
            modified,
            archived,
        });
    }
    result.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.key.cmp(&b.key)));
    result
}

fn text(value: &Value) -> Option<String> {
    if let Some(s) = value.as_str() {
        return Some(s.to_owned());
    }
    let chunks = value
        .as_array()?
        .iter()
        .filter_map(|block| block["text"].as_str())
        .collect::<Vec<_>>();
    (!chunks.is_empty()).then(|| chunks.join("\n"))
}

fn string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(s) => Some(s.clone()),
        value => Some(value.to_string()),
    }
}

fn tool(name: &str, id: Option<&str>, input: &Value, key: &str) -> Value {
    let args: Value = input
        .as_str()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| input.clone());
    let command = args
        .get("cmd")
        .or_else(|| args.get("command"))
        .and_then(string);
    let path = args
        .get("file_path")
        .or_else(|| args.get("path"))
        .and_then(Value::as_str);
    let kind = match name {
        "Read" | "read_file" => "读取",
        "Edit" | "MultiEdit" | "Write" | "NotebookEdit" | "apply_patch" => "修改",
        _ if command.is_some() => "命令",
        _ => "工具",
    };
    let patch = (name == "apply_patch").then(|| string(input)).flatten();
    json!({"event":"call","call":id,"kind":kind,"title":command.as_deref().unwrap_or(name),"tool":name,
        "command":command,"path":path,"cwd":args.get("workdir"),"args":string(input),"patch":patch,"key":key})
}

fn message(role: &str, content: Option<String>) -> Vec<Value> {
    match content {
        Some(content) if !content.is_empty() => {
            vec![json!({"event":"message","role":role,"content":content})]
        }
        _ => Vec::new(),
    }
}

fn codex(record: &Value) -> Vec<Value> {
    let payload = &record["payload"];
    match (record["type"].as_str(), payload["type"].as_str()) {
        (Some("session_meta"), _) => {
            vec![json!({"event":"meta","cwd":payload["cwd"],"sessionId":payload["id"]})]
        }
        (Some("turn_context"), _) => vec![json!({"event":"model","model":payload["model"]})],
        (Some("response_item"), Some("message")) => {
            let role = payload["role"].as_str().unwrap_or_default();
            if matches!(role, "user" | "assistant") {
                message(role, text(&payload["content"]))
            } else {
                Vec::new()
            }
        }
        (Some("response_item"), Some("function_call" | "custom_tool_call")) => vec![tool(
            payload["name"].as_str().unwrap_or("未知工具"),
            payload["call_id"].as_str(),
            payload.get("arguments").unwrap_or(&payload["input"]),
            "codex",
        )],
        (Some("response_item"), Some("function_call_output" | "custom_tool_call_output")) => {
            let output = &payload["output"];
            let output_text = string(output);
            let exit = output["exit_code"].as_i64().or_else(|| {
                text(output)
                    .or_else(|| output_text.clone())
                    .as_deref()?
                    .lines()
                    .take(8)
                    .find_map(|line| {
                        line.strip_prefix("Process exited with code ")?
                            .trim()
                            .parse()
                            .ok()
                    })
            });
            vec![
                json!({"event":"result","call":payload["call_id"],"output":output_text,"exit":exit,
                "failed":exit.map(|code| code != 0)}),
            ]
        }
        (Some("event_msg"), Some("task_complete" | "turn_aborted")) => vec![json!({"event":"end"})],
        (Some("response_item"), Some("reasoning")) => Vec::new(),
        _ => vec![
            json!({"event":"unknown","type":payload["type"].as_str().or(record["type"].as_str())}),
        ],
    }
}

fn parse(provider: Provider, record: &Value) -> Vec<Value> {
    let mut events = match provider {
        Provider::Codex => codex(record),
        Provider::Claude => Vec::new(),
    };
    for event in &mut events {
        event["time"] = record["timestamp"].clone();
    }
    events
}

fn migrate(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS sources (
      path TEXT PRIMARY KEY, cwd TEXT NOT NULL DEFAULT '', cursor INTEGER NOT NULL DEFAULT 0,
      identity TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      path TEXT NOT NULL, ordinal INTEGER NOT NULL, sub INTEGER NOT NULL, body TEXT NOT NULL,
      PRIMARY KEY(path, ordinal, sub)
    );
    PRAGMA user_version = 2;",
    )
    .map_err(|e| e.to_string())
}

pub fn open(db_path: &Path) -> Result<Connection, String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    db.busy_timeout(std::time::Duration::from_secs(3))
        .map_err(|e| e.to_string())?;
    migrate(&db)?;
    Ok(db)
}

pub fn session(
    db: &mut Connection,
    key: &str,
    extra: &[(PathBuf, Provider)],
) -> Result<Value, String> {
    let path = Path::new(key);
    let permitted = files(extra);
    if let Some(&(provider, _)) = permitted.get(path) {
        ingest(db, path, provider)?;
    } else {
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sources WHERE path=?1)",
                [key],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !exists {
            return Err("找不到会话来源".into());
        }
    }
    let mut stmt = db
        .prepare("SELECT body FROM events WHERE path=?1 ORDER BY ordinal, sub")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([key], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let events = rows
        .map(|row| {
            let body = row.map_err(|e| e.to_string())?;
            serde_json::from_str::<Value>(&body).map_err(|e| e.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(json!({"steps":timeline(&events),"eventCount":events.len()}))
}

fn ingest(db: &mut Connection, path: &Path, provider: Provider) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;
    let file = File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let identity = format!("{}:{}", metadata.dev(), metadata.ino());
    let key = path.to_string_lossy();
    let tx = db
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let old = tx
        .query_row(
            "SELECT cursor, identity, cwd FROM sources WHERE path=?1",
            [key.as_ref()],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .ok();
    let (mut cursor, mut cwd) = match old {
        Some((offset, id, cwd))
            if id == identity && offset >= 0 && offset as u64 <= metadata.len() =>
        {
            (offset as u64, cwd)
        }
        _ => {
            tx.execute("DELETE FROM events WHERE path=?1", [key.as_ref()])
                .map_err(|e| e.to_string())?;
            (0, String::new())
        }
    };
    let mut reader = BufReader::new(file);
    reader
        .seek(SeekFrom::Start(cursor))
        .map_err(|e| e.to_string())?;
    let mut line = Vec::new();
    loop {
        line.clear();
        let read = reader
            .read_until(b'\n', &mut line)
            .map_err(|e| e.to_string())?;
        if read == 0 || line.last() != Some(&b'\n') {
            break;
        }
        if let Ok(record) = serde_json::from_slice::<Value>(&line) {
            for (sub, event) in parse(provider, &record).into_iter().enumerate() {
                if let Some(path) = event["cwd"].as_str().filter(|_| event["event"] == "meta") {
                    cwd = path.to_owned();
                }
                tx.execute(
                    "INSERT INTO events VALUES (?1,?2,?3,?4)",
                    params![key.as_ref(), cursor as i64, sub as i64, event.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        cursor += read as u64;
    }
    tx.execute("INSERT INTO sources VALUES (?1,?2,?3,?4) ON CONFLICT(path) DO UPDATE SET cwd=excluded.cwd,cursor=excluded.cursor,identity=excluded.identity",params![key.as_ref(),cwd,cursor as i64,identity]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

fn timeline(events: &[Value]) -> Vec<Value> {
    let mut steps: Vec<Value> = Vec::new();
    let mut calls = BTreeMap::new();
    let mut round = 1;
    let mut started = false;
    for event in events {
        match event["event"].as_str() {
            Some("end") => {
                for step in &mut steps {
                    if step["round"] == round && step["state"] == "等待结果" {
                        step["state"] = json!("未记录结果");
                    }
                }
            }
            Some("result") => {
                if let Some(index) = event["call"].as_str().and_then(|id| calls.get(id)).copied() {
                    let step: &mut Value = &mut steps[index];
                    step["state"] = json!(if event["failed"] == true {"失败"} else if event["failed"] == false {"成功"} else {"已记录结果"});
                    step["output"] = event["output"].clone();
                    step["exit"] = event["exit"].clone();
                } else {
                    steps.push(json!({"id":steps.len()+1,"round":round,"kind":"结果","title":"未配对的工具结果",
                        "state":"未知","output":event["output"],"exit":event["exit"],"time":event["time"]}));
                }
            }
            Some("call") => {
                let mut step = event.clone();
                step["id"] = json!(steps.len()+1);
                step["round"] = json!(round);
                step["state"] = json!("等待结果");
                if let Some(call) = event["call"].as_str() { calls.insert(call,steps.len()); }
                steps.push(step);
            }
            Some("message") => {
                if event["role"] == "user" {
                    if started { round += 1; }
                    started = true;
                }
                let content = event["content"].as_str().unwrap_or_default();
                steps.push(json!({"id":steps.len()+1,"round":round,"kind":"消息","title":content.chars().take(110).collect::<String>(),
                    "content":content,"state":"已记录","time":event["time"]}));
            }
            Some("unknown") => steps.push(json!({"id":steps.len()+1,"round":round,"kind":"事件","title":event["type"],"state":"未知","time":event["time"]})),
            _ => (),
        }
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_pairs_result_without_changing_output() {
        let records = [
            json!({"type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"cargo check\"}","call_id":"a"}}),
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"a","output":"Process exited with code 1\nError"}}),
        ];
        let events = records
            .iter()
            .flat_map(|record| parse(Provider::Codex, record))
            .collect::<Vec<_>>();
        let steps = timeline(&events);
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0]["state"], "失败");
        assert_eq!(steps[0]["output"], "Process exited with code 1\nError");
    }
}
