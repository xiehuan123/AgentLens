pub mod chatgpt;

use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Provider {
    Codex,
    Claude,
}

impl Provider {
    pub fn from_name(value: &str) -> Option<Self> {
        match value {
            "Codex" => Some(Self::Codex),
            "Claude Code" => Some(Self::Claude),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
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
    project_key: String,
    project_order: Option<usize>,
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

fn codex_home(home: &Path) -> PathBuf {
    std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"))
}

fn roots() -> Vec<(PathBuf, Provider, bool)> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    let codex = codex_home(&home);
    let claude = std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".claude"));
    vec![
        (claude.join("projects"), Provider::Claude, false),
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

fn project_hint(path: &Path, provider: Provider) -> Option<String> {
    let reader = BufReader::new(File::open(path).ok()?.take(256 * 1024));
    reader
        .split(b'\n')
        .take(16)
        .filter_map(Result::ok)
        .find_map(|line| {
            let record = serde_json::from_slice::<Value>(&line).ok()?;
            let cwd = match provider {
                Provider::Codex if record["type"] == "session_meta" => {
                    record["payload"]["cwd"].as_str()
                }
                Provider::Claude => record["cwd"].as_str(),
                _ => None,
            }?;
            Some(cwd.to_owned())
        })
}

struct DesktopMetadata {
    titles: BTreeMap<String, String>,
    state: Value,
}

impl DesktopMetadata {
    fn read(home: &Path) -> Self {
        let mut titles = BTreeMap::new();
        if let Ok(file) = File::open(home.join("session_index.jsonl")) {
            for line in BufReader::new(file).split(b'\n').map_while(Result::ok) {
                if let Ok(row) = serde_json::from_slice::<Value>(&line) {
                    if let (Some(id), Some(title)) =
                        (row["id"].as_str(), row["thread_name"].as_str())
                    {
                        if !title.trim().is_empty() {
                            titles.insert(id.to_owned(), title.to_owned());
                        }
                    }
                }
            }
        }
        let state = File::open(home.join(".codex-global-state.json"))
            .ok()
            .and_then(|file| serde_json::from_reader(BufReader::new(file)).ok())
            .unwrap_or_default();
        Self { titles, state }
    }

    fn project(&self, id: &str, cwd: &Path) -> Option<(&str, &str, Option<usize>)> {
        let projects = self.state["local-projects"].as_object()?;
        let assigned = self.state["thread-project-assignments"][id]["projectId"].as_str();
        let (key, project) = if let Some(entry) = assigned.and_then(|id| projects.get_key_value(id))
        {
            entry
        } else {
            projects
                .iter()
                .filter_map(|entry| {
                    let depth = entry.1["rootPaths"]
                        .as_array()?
                        .iter()
                        .filter_map(Value::as_str)
                        .map(Path::new)
                        .filter(|root| root.is_absolute() && cwd.starts_with(root))
                        .map(|root| root.components().count())
                        .max()?;
                    Some((depth, entry))
                })
                .max_by_key(|(depth, _)| *depth)?
                .1
        };
        let position = self.state["project-order"]
            .as_array()
            .and_then(|order| order.iter().position(|item| item.as_str() == Some(key)));
        Some((key, project["name"].as_str()?, position))
    }

    fn projectless(&self, id: &str) -> bool {
        self.state["projectless-thread-ids"]
            .as_array()
            .is_some_and(|ids| ids.iter().any(|value| value.as_str() == Some(id)))
    }
}

fn rollout_id(stem: &str) -> Option<&str> {
    let id = stem.get(stem.len().checked_sub(36)?..)?;
    id.bytes()
        .enumerate()
        .all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
        .then_some(id)
}

pub fn list(db: &Connection, extra: &[(PathBuf, Provider)]) -> Vec<Session> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    let desktop = DesktopMetadata::read(&codex_home(&home));
    let mut result = Vec::new();
    let mut catalog = BTreeMap::new();
    if let Ok(mut query) = db.prepare("SELECT path,cwd,modified,provider,archived FROM catalog") {
        if let Ok(rows) = query.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, bool>(4)?,
            ))
        }) {
            for (key, cwd, modified, provider, archived) in rows.flatten() {
                if let Some(provider) = Provider::from_name(&provider) {
                    catalog.insert(key, (cwd, modified.max(0) as u64, provider, archived));
                }
            }
        }
    }
    for (path, (provider, archived)) in files(extra) {
        let key = path.to_string_lossy().into_owned();
        let modified = path
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or_default();
        let cwd = catalog
            .get(&key)
            .filter(|entry| !entry.0.is_empty())
            .map(|entry| entry.0.clone())
            .or_else(|| project_hint(&path, provider))
            .unwrap_or_default();
        let changed = catalog
            .get(&key)
            .is_none_or(|entry| entry.1 != modified || entry.0 != cwd);
        if changed {
            let _=db.execute("INSERT INTO catalog VALUES (?1,?2,?3,?4,?5) ON CONFLICT(path) DO UPDATE SET cwd=excluded.cwd,modified=excluded.modified,provider=excluded.provider,archived=excluded.archived",params![key,cwd,modified as i64,provider.name(),archived]);
        }
        catalog.insert(key, (cwd, modified, provider, archived));
    }
    for (key, (cwd, modified, provider, archived)) in catalog {
        let path = Path::new(&key);
        let stem = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or_default();
        let id = if provider == Provider::Codex {
            rollout_id(stem).unwrap_or_default()
        } else {
            ""
        };
        let project_path = if cwd.is_empty() && provider == Provider::Claude {
            path.parent().unwrap_or_else(|| Path::new(""))
        } else {
            Path::new(&cwd)
        };
        let mut project_key = project_path.to_string_lossy().into_owned();
        let mut project = project_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let mut project_order = None;
        let title = if provider == Provider::Codex {
            if desktop.projectless(id) {
                project_key.clear();
                project.clear();
            } else if let Some((key, name, position)) = desktop.project(id, project_path) {
                project_key = format!("codex-project:{key}");
                project = name.to_owned();
                project_order = position;
            }
            desktop.titles.get(id).cloned().unwrap_or_default()
        } else {
            stem.chars().take(8).collect()
        };
        result.push(Session {
            key,
            provider: provider.name(),
            project,
            project_key,
            project_order,
            title,
            modified,
            archived,
        });
    }
    result.extend(chatgpt::list(db).unwrap_or_default());
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
    let patch = if name == "apply_patch" {
        args["patch"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| string(input))
    } else {
        None
    };
    let mut paths = path.into_iter().map(str::to_owned).collect::<Vec<_>>();
    if let Some(patch) = &patch {
        paths.extend(patch.lines().filter_map(|line| {
            [
                "*** Add File: ",
                "*** Update File: ",
                "*** Delete File: ",
                "*** Move to: ",
            ]
            .iter()
            .find_map(|prefix| line.strip_prefix(prefix))
            .map(str::to_owned)
        }));
    }
    json!({"event":"call","call":id,"kind":kind,"title":command.as_deref().unwrap_or(name),"tool":name,
        "command":command,"path":paths.first(),"paths":paths,"cwd":args.get("workdir"),"args":string(input),"patch":patch,"key":key})
}

fn codex_call(payload: &Value) -> Value {
    let name = payload["name"].as_str().unwrap_or("未知工具");
    let input = payload.get("arguments").unwrap_or(&payload["input"]);
    let mut call = tool(name, payload["call_id"].as_str(), input, "codex");
    if let Some(namespace) = payload["namespace"]
        .as_str()
        .filter(|name| !name.is_empty())
    {
        call["namespace"] = json!(namespace);
    }
    if name == "exec" {
        call["script"] = input.as_str().map_or(Value::Null, |script| json!(script));
    }
    call
}

fn completed_item(payload: &Value) -> Value {
    let item = &payload["item"];
    let kind = item["type"].as_str().unwrap_or("unknown");
    let call = item["id"].as_str();
    let failed = match item["status"].as_str() {
        Some("failed" | "Failed" | "declined" | "Declined") => Some(true),
        Some("completed" | "Completed") => Some(false),
        _ => None,
    };
    match kind {
        "CommandExecution" => {
            json!({"event":"evidence","call":call,"kind":"命令","tool":"exec_command",
            "command":string(&item["command"]),"cwd":item["cwd"],"output":string(&item["aggregated_output"]),
            "exit":item["exit_code"],"failed":item["exit_code"].as_i64().map(|code| code!=0).or(failed)})
        }
        "WebSearch" => json!({"event":"evidence","call":call,"kind":"工具","tool":"web_search",
            "args":string(&item["action"]).or_else(|| string(&item["query"])),"network":true}),
        "McpToolCall" => json!({"event":"evidence","call":call,"kind":"工具","tool":item["tool"],
            "server":item["server"],"args":string(&item["arguments"]),"output":string(&item["result"]),"failed":failed}),
        _ => json!({"event":"unknown","type":"item_completed","itemType":kind}),
    }
}

fn message(role: &str, content: Option<String>) -> Vec<Value> {
    match content {
        Some(content) if !content.is_empty() => {
            vec![json!({"event":"message","role":role,"content":content})]
        }
        _ => Vec::new(),
    }
}

fn child_id(output: &Value) -> Option<String> {
    let parsed = output
        .as_str()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok());
    let nested = text(output).and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
    let id = [Some(output), parsed.as_ref(), nested.as_ref()]
        .into_iter()
        .flatten()
        .find_map(|value| {
            ["agent_id", "agentId", "thread_id", "new_thread_id"]
                .iter()
                .find_map(|key| value[*key].as_str())
                .map(str::to_owned)
        });
    id
}

const TOKEN_FIELDS: &[&str] = &[
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "reasoning_output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
];

fn usage_event(source: &str, id: Option<&str>, raw: &Value) -> Option<Value> {
    let values = TOKEN_FIELDS
        .iter()
        .filter_map(|field| raw[*field].as_u64().map(|n| (field.to_string(), json!(n))))
        .collect::<serde_json::Map<String, Value>>();
    (!values.is_empty())
        .then(|| json!({"event":"usage","source":source,"messageId":id,"values":values}))
}

fn usage_summary(events: &[Value]) -> Value {
    let usage = events
        .iter()
        .filter(|event| event["event"] == "usage")
        .collect::<Vec<_>>();
    for source in ["token_usage_record", "token_count"] {
        if let Some(event) = usage.iter().rev().find(|event| event["source"] == source) {
            return json!({"source":source,"values":event["values"]});
        }
    }
    let mut messages = BTreeMap::<&str, &Value>::new();
    for event in usage {
        if let Some(id) = event["messageId"].as_str() {
            messages.insert(id, &event["values"]);
        }
    }
    if messages.is_empty() {
        return Value::Null;
    }
    let mut values = serde_json::Map::new();
    for field in [
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
    ] {
        let total = messages
            .values()
            .try_fold(0u64, |sum, value| sum.checked_add(value[field].as_u64()?));
        if let Some(total) = total {
            values.insert(field.to_owned(), json!(total));
        }
    }
    json!({"source":"message.usage","values":values})
}

fn diagnostic(event: &str, kind: &str, state: &str, payload: &Value) -> Value {
    let error = &payload["error"];
    let reason = [
        payload["reason"].as_str(),
        payload["message"].as_str(),
        error["message"].as_str(),
        error["reason"].as_str(),
        error.as_str(),
    ]
    .into_iter()
    .flatten()
    .find(|text| !text.is_empty());
    let code = [
        &payload["code"],
        &error["code"],
        &payload["codex_error_info"],
        &error["codex_error_info"],
    ]
    .into_iter()
    .find(|value| !value.is_null())
    .and_then(string);
    json!({"event":event,"diagnostic":kind,"state":state,"reason":reason,"errorCode":code,
        "responseId":payload["response_id"],"requestId":payload["request_id"],"durationMs":payload["duration_ms"]})
}

fn codex(record: &Value) -> Vec<Value> {
    let payload = &record["payload"];
    match (record["type"].as_str(), payload["type"].as_str()) {
        (Some("token_usage_record"), _) => {
            let mut events: Vec<_> =
                usage_event("token_usage_record", None, &payload["thread_token_usage"])
                    .into_iter()
                    .collect();
            if let Some(id) = payload["response_id"].as_str().filter(|id| !id.is_empty()) {
                let mut response = diagnostic("diagnostic", "model_response", "已记录", payload);
                response["responseId"] = json!(id);
                events.push(response);
            }
            events
        }
        (Some("event_msg"), Some("token_count")) => {
            usage_event("token_count", None, &payload["info"]["total_token_usage"])
                .into_iter()
                .collect()
        }
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
        (Some("response_item"), Some("function_call" | "custom_tool_call")) => {
            vec![codex_call(payload)]
        }
        (Some("event_msg"), Some("item_completed")) => vec![completed_item(payload)],
        (Some("response_item"), Some("web_search_call")) => {
            let mut call = tool(
                "web_search",
                payload["id"].as_str(),
                &payload["action"],
                "codex",
            );
            call["network"] = json!(true);
            call["event"] = json!("evidence");
            vec![call]
        }
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
                "failed":exit.map(|code| code != 0).or_else(||output["isError"].as_bool()),
                "reason":output["error"]["message"].as_str().or(output["error"].as_str()),
                "errorCode":string(&output["error"]["code"]),"child":child_id(output)}),
            ]
        }
        (Some("event_msg"), Some("patch_apply_end")) => {
            let paths = payload["changes"]
                .as_object()
                .map(|changes| changes.keys().cloned().collect::<Vec<_>>())
                .unwrap_or_default();
            vec![
                json!({"event":"result","call":payload["call_id"],"output":payload["stdout"],"failed":payload["success"].as_bool().map(|ok| !ok),"paths":paths}),
            ]
        }
        (Some("event_msg"), Some("task_started" | "turn_started")) => {
            vec![diagnostic("diagnostic", "task_started", "已记录", payload)]
        }
        (Some("event_msg"), Some("turn_aborted")) => {
            vec![diagnostic("end", "turn_aborted", "已中止", payload)]
        }
        (Some("event_msg"), Some("task_complete" | "turn_complete")) => {
            let state = if payload["error"].is_null() {
                "已记录"
            } else {
                "失败"
            };
            vec![diagnostic("end", "task_complete", state, payload)]
        }
        (Some("event_msg"), Some("stream_error")) => {
            vec![diagnostic("diagnostic", "stream_error", "失败", payload)]
        }
        (Some("event_msg"), Some("error")) => {
            vec![diagnostic("diagnostic", "session_error", "失败", payload)]
        }
        (Some("response_item"), Some("reasoning")) => Vec::new(),
        _ => vec![
            json!({"event":"unknown","type":payload["type"].as_str().or(record["type"].as_str())}),
        ],
    }
}

fn claude(record: &Value) -> Vec<Value> {
    let payload = &record["message"];
    let kind = record["type"].as_str().unwrap_or("unknown");
    let mut events = Vec::new();
    if let (Some(cwd), Some(id)) = (record["cwd"].as_str(), record["sessionId"].as_str()) {
        events.push(json!({"event":"meta","cwd":cwd,"sessionId":id}));
    }
    match kind {
        "user" | "assistant" => {
            if kind == "assistant" {
                if let Some(id) = payload["id"].as_str() {
                    events.extend(usage_event("message.usage", Some(id), &payload["usage"]));
                }
            }
            if kind == "assistant" && payload["model"].is_string() {
                events.push(json!({"event":"model","model":payload["model"]}));
            }
            if record["isMeta"] != true {
                events.extend(message(kind, text(&payload["content"])));
            }
            if let Some(blocks) = payload["content"].as_array() {
                for block in blocks {
                    match block["type"].as_str() {
                        Some("tool_use") => events.push(tool(
                            block["name"].as_str().unwrap_or("unknown"),
                            block["id"].as_str(),
                            &block["input"],
                            "claude",
                        )),
                        Some("tool_result") => events.push(json!({
                            "event":"result","call":block["tool_use_id"],
                            "output":string(&block["content"]),"failed":block["is_error"].as_bool(),
                            "child":child_id(&record["toolUseResult"])
                        })),
                        _ => (),
                    }
                }
            }
        }
        "system" if record["subtype"] == "turn_duration" => events.push(json!({"event":"end"})),
        _ => events.push(json!({"event":"unknown","type":kind})),
    }
    events
}

fn parse(provider: Provider, record: &Value) -> Vec<Value> {
    let mut events = match provider {
        Provider::Codex => codex(record),
        Provider::Claude => claude(record),
    };
    for event in &mut events {
        if provider == Provider::Codex {
            let payload = &record["payload"];
            if let Some(id) = payload["turn_id"].as_str().or_else(|| {
                payload["internal_chat_message_metadata_passthrough"]["turn_id"].as_str()
            }) {
                event["turnId"] = json!(id);
            }
            if let Some(root) = payload["root_turn_id"].as_str() {
                event["rootTurnId"] = json!(root);
            }
        }
        event["time"] = if record["timestamp"].is_null() && event["event"] == "evidence" {
            record["payload"]["completed_at_ms"].clone()
        } else {
            record["timestamp"].clone()
        };
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
    CREATE TABLE IF NOT EXISTS catalog (
      path TEXT PRIMARY KEY, cwd TEXT NOT NULL, modified INTEGER NOT NULL,
      provider TEXT NOT NULL, archived INTEGER NOT NULL
    );
    PRAGMA user_version = 4;",
    )
    .map_err(|e| e.to_string())?;
    chatgpt::migrate(db).map_err(|e| e.to_string())
}

pub fn open(db_path: &Path) -> Result<Connection, String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    db.busy_timeout(std::time::Duration::from_secs(3))
        .map_err(|e| e.to_string())?;
    migrate(&db)?;
    Ok(db)
}

pub fn folders(db: &Connection) -> Result<Vec<(PathBuf, Provider)>, String> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS folders (path TEXT PRIMARY KEY, provider TEXT NOT NULL);",
    )
    .map_err(|e| e.to_string())?;
    let mut query = db
        .prepare("SELECT path, provider FROM folders")
        .map_err(|e| e.to_string())?;
    let rows = query
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let folders = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(folders
        .into_iter()
        .filter_map(|(path, name)| Some((PathBuf::from(path), Provider::from_name(&name)?)))
        .collect())
}

pub fn add_folder(db: &Connection, path: &Path, provider: Provider) -> Result<(), String> {
    folders(db)?;
    db.execute("INSERT INTO folders VALUES (?1,?2) ON CONFLICT(path) DO UPDATE SET provider=excluded.provider",
        params![path.to_string_lossy().as_ref(),provider.name()]).map_err(|e|e.to_string())?;
    Ok(())
}

pub fn session(
    db: &mut Connection,
    key: &str,
    extra: &[(PathBuf, Provider)],
) -> Result<Value, String> {
    if let Some(chat) = chatgpt::session(db, key)? {
        return Ok(chat);
    }
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
    let model = events.iter().rev().find_map(|e| {
        (e["event"] == "model")
            .then(|| e["model"].as_str())
            .flatten()
    });
    Ok(
        json!({"steps":timeline(&events),"eventCount":events.len(),"usage":usage_summary(&events),"model":model}),
    )
}

fn ingest(db: &mut Connection, path: &Path, provider: Provider) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;
    let file = File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let identity = format!("5:{}:{}", metadata.dev(), metadata.ino());
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

fn diagnostic_step(event: &Value, id: usize, round: usize) -> Value {
    let mut step = event.clone();
    step["id"] = json!(id);
    step["round"] = json!(round);
    step["kind"] = json!("事件");
    step["title"] = event["diagnostic"].clone();
    step
}

fn timeline(events: &[Value]) -> Vec<Value> {
    let mut steps: Vec<Value> = Vec::new();
    let mut calls = BTreeMap::new();
    let call_ids: std::collections::HashSet<_> = events
        .iter()
        .filter(|event| event["event"] == "call")
        .filter_map(|event| event["call"].as_str())
        .collect();
    let evidence: BTreeMap<_, _> = events
        .iter()
        .filter(|event| event["event"] == "evidence")
        .filter_map(|event| Some((event["call"].as_str()?, event)))
        .collect();
    let mut round = 1;
    let mut started = false;
    let mut turn_rounds = BTreeMap::new();
    let mut latest_round = 1;
    let mut seen_responses = std::collections::HashSet::new();
    for event in events {
        let explicit_turn = event["turnId"].as_str();
        let event_round = if let Some(turn) = explicit_turn {
            *turn_rounds.entry(turn).or_insert_with(|| {
                if started {
                    latest_round += 1;
                }
                started = true;
                round = latest_round;
                round
            })
        } else {
            round
        };
        match event["event"].as_str() {
            Some("end") => {
                for step in &mut steps {
                    if step["round"] == event_round && step["state"] == "等待结果" {
                        step["state"] = json!("未记录结果");
                    }
                }
                if event["diagnostic"].is_string() {
                    steps.push(diagnostic_step(event, steps.len()+1, event_round));
                }
            }
            Some("diagnostic") => {
                if event["diagnostic"] != "model_response" || seen_responses.insert(
                    (event["turnId"].as_str(),event["responseId"].as_str())) {
                    steps.push(diagnostic_step(event, steps.len()+1,event_round));
                }
            }
            Some("result") => {
                if let Some(index) = event["call"].as_str().and_then(|id| calls.get(id)).copied() {
                    let step: &mut Value = &mut steps[index];
                    if let Some(failed) = event["failed"].as_bool() {
                        step["state"] = json!(if failed {"失败"} else {"成功"});
                    } else if !matches!(step["state"].as_str(), Some("成功" | "失败")) {
                        step["state"] = json!("已记录结果");
                    }
                    if event["paths"].as_array().is_some_and(|paths| !paths.is_empty()) {
                        step["paths"] = event["paths"].clone();
                    }
                    if matches!(step["tool"].as_str(), Some("spawn_agent" | "Agent" | "Task")) && event["child"].is_string() {
                        step["child"] = event["child"].clone();
                    }
                    if !event["output"].is_null() { step["output"] = event["output"].clone(); }
                    for field in ["exit", "reason", "errorCode"] {
                        if !event[field].is_null() { step[field] = event[field].clone(); }
                    }
                } else {
                    steps.push(json!({"id":steps.len()+1,"round":event_round,"kind":"结果","title":"未配对的工具结果",
                        "state":"未知","call":event["call"],"turnId":event["turnId"],"reason":event["reason"],"errorCode":event["errorCode"],"output":event["output"],"exit":event["exit"],"time":event["time"]}));
                }
            }
            Some("evidence") if event["call"].as_str().is_some_and(|id|call_ids.contains(id) || calls.contains_key(id)) => (),
            Some("call" | "evidence") => {
                let mut step = event.clone();
                step["id"] = json!(steps.len()+1);
                step["round"] = json!(event_round);
                step["state"] = json!("等待结果");
                if event["event"] == "evidence" {
                    step["title"] = event["tool"].clone();
                }
                let source = if let Some(call) = event["call"].as_str() {
                    calls.insert(call,steps.len());
                    evidence.get(call).copied()
                } else if event["event"] == "evidence" { Some(event) } else { None };
                if let Some(source) = source {
                    for field in ["command","cwd","server","exit","output","args","network"] {
                        if !source[field].is_null() && (field != "args" || step[field].is_null()) {
                            step[field] = source[field].clone();
                        }
                    }
                    step["state"] = json!(match source["failed"].as_bool() {
                        Some(true) => "失败", Some(false) => "成功", None => "已记录结果",
                    });
                }
                steps.push(step);
            }
            Some("message") => {
                let message_round = if event["role"] == "user" && explicit_turn.is_none() {
                    if started && turn_rounds.is_empty() {
                        latest_round += 1;
                        round = latest_round;
                    }
                    started = true;
                    round
                } else { event_round };
                let content = event["content"].as_str().unwrap_or_default();
                steps.push(json!({"id":steps.len()+1,"round":message_round,"kind":"消息","turnId":event["turnId"],"title":content.chars().take(110).collect::<String>(),
                    "content":content,"role":event["role"],"state":"已记录","time":event["time"]}));
            }
            Some("unknown") => steps.push(json!({"id":steps.len()+1,"round":event_round,"kind":"事件","turnId":event["turnId"],"title":event["type"],"itemType":event["itemType"],"state":"已记录","time":event["time"]})),
            _ => (),
        }
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_desktop_projects_prefer_explicit_assignment() {
        let id = "01a20db3-0000-7000-8000-000000000000";
        let metadata = DesktopMetadata {
            titles: BTreeMap::new(),
            state: json!({
                "thread-project-assignments": { (id): {"projectId":"assigned"} },
                "local-projects": {
                    "assigned":{"name":"Assigned project","rootPaths":["/elsewhere"]},
                    "nested":{"name":"Nested","rootPaths":["/workspace/project"]},
                    "outer":{"name":"Outer","rootPaths":["/workspace"]}
                },
                "project-order":["outer","assigned","nested"]
            }),
        };
        let stem = format!("rollout-2026-11-24T21-16-07-{id}");
        assert_eq!(rollout_id(&stem), Some(id));
        assert_eq!(
            metadata.project(id, Path::new("/workspace/project")),
            Some(("assigned", "Assigned project", Some(1)))
        );
        assert_eq!(
            metadata.project("", Path::new("/workspace/project")),
            Some(("nested", "Nested", Some(2)))
        );
    }

    #[test]
    fn codex_diagnostics_use_recorded_turns_and_response_ids() {
        let records = [
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"t1"}}),
            json!({"type":"response_item","payload":{"type":"message","role":"user","content":"Question",
                "internal_chat_message_metadata_passthrough":{"turn_id":"t1"}}}),
            json!({"type":"token_usage_record","payload":{"response_id":"r1","turn_id":"t1"}}),
            json!({"type":"token_usage_record","payload":{"response_id":"r1","turn_id":"t1"}}),
            json!({"type":"response_item","payload":{"type":"function_call","name":"exec_command",
                "call_id":"c1","internal_chat_message_metadata_passthrough":{"turn_id":"t1"}}}),
            json!({"type":"event_msg","payload":{"type":"turn_aborted","turn_id":"t1","reason":"interrupted","duration_ms":876}}),
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"t2"}}),
            json!({"type":"event_msg","payload":{"type":"stream_error","turn_id":"t2",
                "message":"Connection closed","codex_error_info":{"responseStreamDisconnected":{"httpStatusCode":502}}}}),
        ];
        let events = records
            .iter()
            .flat_map(|record| parse(Provider::Codex, record))
            .collect::<Vec<_>>();
        let steps = timeline(&events);
        assert_eq!(steps.len(), 7);
        assert_eq!(steps[1]["round"], 1);
        assert_eq!(steps[2]["responseId"], "r1");
        assert!(steps[2]["requestId"].is_null());
        assert_eq!(steps[3]["call"], "c1");
        assert_eq!(steps[3]["state"], "未记录结果");
        assert_eq!(steps[4]["reason"], "interrupted");
        assert_eq!(steps[4]["durationMs"], 876);
        assert_eq!(steps[6]["round"], 2);
        assert_eq!(steps[6]["reason"], "Connection closed");
    }

    #[test]
    fn completed_command_adds_tool_evidence_without_duplicate_step() {
        let call = json!({"type":"response_item","payload":{"type":"function_call","call_id":"one","name":"exec","arguments":"{}"}});
        let done = json!({"type":"event_msg","payload":{"type":"item_completed","item":{
            "type":"CommandExecution","id":"one","command":"cargo check","exit_code":1,"aggregated_output":"error"
        }}});
        let events = [call, done]
            .iter()
            .flat_map(|record| parse(Provider::Codex, record))
            .collect::<Vec<_>>();
        let steps = timeline(&events);
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0]["command"], "cargo check");
        assert_eq!(steps[0]["exit"], 1);
        assert_eq!(steps[0]["state"], "失败");
    }

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

    #[test]
    fn claude_pairs_result_and_omits_thinking() {
        let records = [
            json!({"type":"assistant","message":{"content":[{"type":"thinking","thinking":"private"},{"type":"tool_use","id":"t","name":"Read","input":{"file_path":"/tmp/a"}}]}}),
            json!({"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t","is_error":false,"content":"data"}]}}),
        ];
        let events = records
            .iter()
            .flat_map(|record| parse(Provider::Claude, record))
            .collect::<Vec<_>>();
        let steps = timeline(&events);
        assert_eq!(steps.len(), 1);
        assert_eq!(steps[0]["path"], "/tmp/a");
        assert_eq!(steps[0]["output"], "data");
        assert!(!json!(events).to_string().contains("private"));
    }

    #[test]
    fn usage_uses_codex_snapshot_once_and_deduplicates_claude() {
        let codex = [
            usage_event("token_usage_record", None, &json!({"total_tokens":20})).unwrap(),
            usage_event("token_count", None, &json!({"total_tokens":30})).unwrap(),
        ];
        assert_eq!(usage_summary(&codex)["values"]["total_tokens"], 20);
        let claude = usage_event("message.usage", Some("m"), &json!({"output_tokens":3})).unwrap();
        let result = usage_summary(&[claude.clone(), claude]);
        assert_eq!(result["values"]["output_tokens"], 3);
        assert!(result["values"]["input_tokens"].is_null());
    }
}
