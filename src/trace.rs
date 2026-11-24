use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs::File,
    io::{self, BufReader, Read},
    path::{Component, Path, PathBuf},
    process::Command,
};

const MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Deserialize)]
struct ReducedTrace {
    schema_version: u32,
    trace_id: String,
    #[serde(default)]
    recording_status: Value,
    inference_calls: BTreeMap<String, Inference>,
    raw_payloads: BTreeMap<String, Payload>,
}

#[derive(Deserialize)]
struct Inference {
    thread_id: String,
    codex_turn_id: String,
    model: String,
    provider_name: String,
    response_id: Option<String>,
    upstream_request_id: Option<String>,
    execution: Execution,
    raw_request_payload_id: String,
    #[serde(default)]
    tool_call_ids_started_by_response: Vec<String>,
}

#[derive(Deserialize)]
struct Execution {
    started_at_unix_ms: Option<i64>,
    ended_at_unix_ms: Option<i64>,
    status: Value,
}

#[derive(Clone, Deserialize)]
struct Payload {
    raw_payload_id: String,
    shard: Option<u64>,
    path: Option<PathBuf>,
    #[serde(default)]
    capture: Value,
    #[serde(default)]
    parts: Vec<Payload>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSummary {
    id: String,
    thread_id: String,
    turn_id: String,
    model: String,
    provider: String,
    response_id: Option<String>,
    request_id: Option<String>,
    started_at: Option<i64>,
    duration_ms: Option<i64>,
    status: Value,
    tool_call_ids: Vec<String>,
    capture: &'static str,
}

pub struct TraceBundle {
    root: PathBuf,
    state: ReducedTrace,
}

fn contained(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    if relative
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Trace path must stay inside the selected bundle.".into());
    }
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.starts_with(root) || !path.is_file() {
        return Err("Trace file must stay inside the selected bundle.".into());
    }
    Ok(path)
}

fn limited_file(path: &Path) -> Result<File, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_BYTES {
        return Err("Trace file exceeds the 64 MiB viewer limit.".into());
    }
    Ok(file)
}

impl TraceBundle {
    pub fn open(root: PathBuf, recorder: Option<&Path>) -> Result<Self, String> {
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let state = if let Some(recorder) = recorder {
            // The recorder owns raw event replay. Write its reduced output outside the source.
            let manifest = contained(&root, Path::new("manifest.json"))?;
            let manifest: Value = serde_json::from_reader(BufReader::new(limited_file(&manifest)?))
                .map_err(|e| e.to_string())?;
            for (key, expected) in [
                ("raw_event_log", "trace.jsonl"),
                ("payloads_dir", "payloads"),
            ] {
                if manifest
                    .get(key)
                    .is_some_and(|value| value.as_str() != Some(expected))
                {
                    return Err("Unexpected trace bundle layout.".into());
                }
            }
            contained(&root, Path::new("trace.jsonl"))?;
            let directory = tempfile::tempdir().map_err(|e| e.to_string())?;
            let output = directory.path().join("state.json");
            let status = Command::new(recorder)
                .args(["debug", "trace-reduce", "--output"])
                .arg(&output)
                .arg(&root)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .map_err(|e| e.to_string())?;
            if !status.success() {
                return Err(
                    "Codex could not reduce this bundle. Select the executable that recorded it."
                        .into(),
                );
            }
            serde_json::from_reader(BufReader::new(limited_file(&output)?))
                .map_err(|e| e.to_string())?
        } else {
            let path = contained(&root, Path::new("state.json"))?;
            serde_json::from_reader(BufReader::new(limited_file(&path)?))
                .map_err(|e| e.to_string())?
        };
        let state: ReducedTrace = state;
        if !(1..=3).contains(&state.schema_version) {
            return Err(format!(
                "Unsupported Codex Trace schema {}.",
                state.schema_version
            ));
        }
        Ok(Self { root, state })
    }

    pub fn summary(&self) -> Value {
        let mut entries = Vec::new();
        for (id, call) in &self.state.inference_calls {
            let time = &call.execution;
            entries.push(RequestSummary {
                id: id.clone(),
                thread_id: call.thread_id.clone(),
                turn_id: call.codex_turn_id.clone(),
                model: call.model.clone(),
                provider: call.provider_name.clone(),
                response_id: call.response_id.clone(),
                request_id: call.upstream_request_id.clone(),
                started_at: time.started_at_unix_ms,
                duration_ms: time
                    .ended_at_unix_ms
                    .zip(time.started_at_unix_ms)
                    .and_then(|(end, start)| end.checked_sub(start))
                    .filter(|value| *value >= 0),
                status: time.status.clone(),
                tool_call_ids: call.tool_call_ids_started_by_response.clone(),
                capture: self
                    .state
                    .raw_payloads
                    .get(&call.raw_request_payload_id)
                    .map(Payload::capture_status)
                    .unwrap_or("missing"),
            });
        }
        entries.sort_by(|a, b| {
            b.started_at
                .cmp(&a.started_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        serde_json::json!({"traceId":self.state.trace_id,"recordingStatus":self.state.recording_status,"requests":entries})
    }

    pub fn request(&self, id: &str) -> Result<String, String> {
        let call = self
            .state
            .inference_calls
            .get(id)
            .ok_or("Unknown inference call.")?;
        let payload = self
            .state
            .raw_payloads
            .get(&call.raw_request_payload_id)
            .ok_or("No captured request body.")?;
        let mut bytes = Vec::new();
        payload.assemble(&self.root, &mut bytes, 0)?;
        String::from_utf8(bytes).map_err(|_| "The recorded body is not UTF-8 text.".into())
    }
}

impl Payload {
    fn capture_status(&self) -> &'static str {
        match self.capture["status"].as_str().or(self.capture.as_str()) {
            Some("omitted") => "omitted",
            Some("truncated") => "truncated",
            Some("complete") | None if self.shard.is_none() && self.path.is_none() => "missing",
            Some("complete") | None => {
                if self
                    .parts
                    .iter()
                    .all(|part| part.capture_status() == "complete")
                {
                    "complete"
                } else {
                    "partial"
                }
            }
            _ => "partial",
        }
    }

    fn assemble(&self, root: &Path, buffer: &mut Vec<u8>, depth: usize) -> Result<(), String> {
        if self.capture_status() != "complete" {
            return Err("Codex omitted or truncated part of this request body.".into());
        }
        if depth > 32 {
            return Err("Too many nested trace fragments.".into());
        }
        let bytes = if let Some(shard) = self.shard {
            let path = contained(root, &PathBuf::from(format!("payloads/{shard:06}.zst")))?;
            let file = limited_file(&path)?;
            let mut decoder = zstd::stream::read::Decoder::new(file).map_err(|e| e.to_string())?;
            decoder.window_log_max(23).map_err(|e| e.to_string())?;
            read_record(decoder.take(MAX_BYTES + 1), &self.raw_payload_id)?
        } else if let Some(path) = &self.path {
            if !path.starts_with("payloads") {
                return Err("Unexpected trace payload path.".into());
            }
            let mut bytes = Vec::new();
            limited_file(&contained(root, path)?)?
                .take(MAX_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            bytes
        } else {
            return Err("No recorded request body file.".into());
        };
        if self.parts.is_empty() {
            return append(buffer, &bytes);
        }
        let fragments: Vec<String> = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if fragments.len() != self.parts.len() + 1 {
            return Err("Invalid trace fragment layout.".into());
        }
        append(buffer, fragments[0].as_bytes())?;
        for (part, suffix) in self.parts.iter().zip(&fragments[1..]) {
            part.assemble(root, buffer, depth + 1)?;
            append(buffer, suffix.as_bytes())?;
        }
        Ok(())
    }
}

fn append(buffer: &mut Vec<u8>, bytes: &[u8]) -> Result<(), String> {
    if buffer.len().saturating_add(bytes.len()) as u64 > MAX_BYTES {
        return Err("Recorded request exceeds the 64 MiB viewer limit.".into());
    }
    buffer.extend_from_slice(bytes);
    Ok(())
}

fn read_record(mut input: impl Read, expected: &str) -> Result<Vec<u8>, String> {
    loop {
        let mut id_len = [0; 2];
        let mut size = [0; 8];
        input
            .read_exact(&mut id_len)
            .map_err(|_| "Requested record was not found in the trace shard.")?;
        input.read_exact(&mut size).map_err(|e| e.to_string())?;
        let size = u64::from_le_bytes(size);
        if size > MAX_BYTES {
            return Err("Trace record exceeds the 64 MiB viewer limit.".into());
        }
        let mut id = vec![0; usize::from(u16::from_le_bytes(id_len))];
        input.read_exact(&mut id).map_err(|e| e.to_string())?;
        if id == expected.as_bytes() {
            let mut body = vec![0; size as usize];
            input.read_exact(&mut body).map_err(|e| e.to_string())?;
            return Ok(body);
        }
        if io::copy(&mut (&mut input).take(size), &mut io::sink()).map_err(|e| e.to_string())?
            != size
        {
            return Err("Incomplete trace shard.".into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reduced_trace_opens_a_request_split_across_zstd_shards() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("payloads")).unwrap();
        for (index, id, body) in [
            (1, "body", "[\"{\\\"input\\\":\",\"}\"]"),
            (2, "part", "[\"hello\"]"),
        ] {
            let mut record = Vec::new();
            record.extend((id.len() as u16).to_le_bytes());
            record.extend((body.len() as u64).to_le_bytes());
            record.extend(id.as_bytes());
            record.extend(body.as_bytes());
            let encoded = zstd::stream::encode_all(record.as_slice(), 1).unwrap();
            std::fs::write(dir.path().join(format!("payloads/{index:06}.zst")), encoded).unwrap();
        }
        let state = json!({"schema_version":3,"trace_id":"example","inference_calls":{
            "request-1":{"thread_id":"thread","codex_turn_id":"turn","model":"example","provider_name":"openai",
                "execution":{"started_at_unix_ms":1000,"ended_at_unix_ms":1250,"status":"completed"},
                "raw_request_payload_id":"body"}},"raw_payloads":{
                "body":{"raw_payload_id":"body","shard":1,"parts":[{"raw_payload_id":"part","shard":2}]}}});
        std::fs::write(dir.path().join("state.json"), state.to_string()).unwrap();
        let trace = TraceBundle::open(dir.path().to_owned(), None).unwrap();
        assert_eq!(trace.summary()["requests"][0]["durationMs"], 250);
        assert_eq!(
            trace.request("request-1").unwrap(),
            r#"{"input":["hello"]}"#
        );
    }

    #[test]
    fn trace_paths_cannot_escape_the_selected_bundle() {
        let dir = tempfile::tempdir().unwrap();
        assert!(contained(dir.path(), Path::new("payloads/../../private.json")).is_err());
    }
}
