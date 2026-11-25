#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod logs;
mod store;
mod trace;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn demo_records(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    store::demo(&mut store::open(&data_dir(&app)?.join("demo.sqlite3"))?)
}

#[tauri::command]
async fn local_sessions(app: tauri::AppHandle) -> Result<Vec<logs::Session>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let db = logs::open(&data_dir(&app)?.join("sessions.sqlite3"))?;
        Ok(logs::list(&db, &logs::folders(&db)?))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_session(app: tauri::AppHandle, key: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut db = logs::open(&data_dir(&app)?.join("sessions.sqlite3"))?;
        let folders = logs::folders(&db)?;
        logs::session(&mut db, &key, &folders)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn choose_folder(app: tauri::AppHandle, provider: String) -> Result<bool, String> {
    let provider = logs::Provider::from_name(&provider).ok_or("Unknown provider")?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = app.dialog().file().blocking_pick_folder() else {
            return Ok(false);
        };
        let folder = folder
            .into_path()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let db = logs::open(&data_dir(&app)?.join("sessions.sqlite3"))?;
        logs::add_folder(&db, &folder, provider)?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_chatgpt(app: tauri::AppHandle) -> Result<Option<usize>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(files) = app
            .dialog()
            .file()
            .add_filter("ChatGPT JSON", &["json"])
            .blocking_pick_files()
        else {
            return Ok(None);
        };
        let paths = files
            .into_iter()
            .map(|file| file.into_path().map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        let mut db = logs::open(&data_dir(&app)?.join("sessions.sqlite3"))?;
        logs::chatgpt::import(&mut db, &paths).map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_diagnostics(app: tauri::AppHandle, markdown: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("Markdown", &["md"])
            .set_file_name("agentlens-diagnostics.md")
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        if !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            return Err("Choose a .md file for the diagnostic report.".into());
        }
        std::fs::write(path, markdown).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Default)]
struct OpenTrace(Mutex<Option<Arc<trace::TraceBundle>>>);

#[tauri::command]
fn trace_configured() -> bool {
    std::env::var_os("CODEX_ROLLOUT_TRACE_ROOT").is_some_and(|value| !value.is_empty())
}

#[tauri::command]
async fn open_codex_trace(
    app: tauri::AppHandle,
    reduce: bool,
) -> Result<Option<serde_json::Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(folder) = app
            .dialog()
            .file()
            .set_title("Open Codex Trace bundle")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let root = folder.into_path().map_err(|e| e.to_string())?;
        let recorder = if reduce {
            let Some(binary) = app
                .dialog()
                .file()
                .set_title("Select the Codex executable that recorded this trace")
                .blocking_pick_file()
            else {
                return Ok(None);
            };
            let selected = binary.into_path().map_err(|e| e.to_string())?;
            let name = selected
                .file_name()
                .and_then(|part| part.to_str())
                .unwrap_or_default();
            if !(name == "codex" || name == "codex.exe" || name.starts_with("codex-"))
                || (cfg!(windows) && !name.to_ascii_lowercase().ends_with(".exe"))
            {
                return Err(
                    "Select the installed Codex executable that recorded this trace.".into(),
                );
            }
            Some(selected.canonicalize().map_err(|e| e.to_string())?)
        } else {
            None
        };
        let trace = trace::TraceBundle::open(root, recorder.as_deref())?;
        let summary = trace.summary();
        *app.state::<OpenTrace>()
            .0
            .lock()
            .map_err(|e| e.to_string())? = Some(Arc::new(trace));
        Ok(Some(summary))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_codex_trace_request(app: tauri::AppHandle, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<OpenTrace>();
        let trace = state.0.lock().map_err(|e| e.to_string())?.clone();
        trace
            .as_ref()
            .ok_or("Open a Codex Trace bundle first.")?
            .request(&id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn close_codex_trace(state: State<'_, OpenTrace>) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
async fn agent_insights(
    app: tauri::AppHandle,
    action: String,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut db = logs::open(&data_dir(&app)?.join("sessions.sqlite3"))?;
        match action.as_str() {
            "scan" => logs::insights::scan(&mut db),
            "index" => logs::insights::index(&mut db, 8),
            "rebuild" => {
                logs::insights::rebuild(&mut db)?;
                Ok(serde_json::Value::Null)
            }
            "query" => logs::insights::dashboard(
                &db,
                serde_json::from_value(input).map_err(|e| e.to_string())?,
            ),
            "versions" => {
                logs::insights::versions(&db, input["path"].as_str().ok_or("Skill path required")?)
            }
            "eval_candidates" => logs::insights::evaluations::candidates(&db, &input),
            "eval_sessions" => logs::insights::session_export::list(&db, &input),
            "eval_sessions_save" => {
                let Some(file) = app
                    .dialog()
                    .file()
                    .add_filter("JSON", &["json"])
                    .set_file_name("agentlens-full-sessions.json")
                    .blocking_save_file()
                else {
                    return Ok(serde_json::Value::Bool(false));
                };
                let path = file.into_path().map_err(|e| e.to_string())?;
                if !path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
                {
                    return Err("Choose a .json file.".into());
                }
                logs::insights::session_export::save(&db, &input, &path)?;
                Ok(serde_json::Value::Bool(true))
            }
            "eval_library" => logs::insights::evaluations::library(
                &mut db,
                input["action"].as_str().unwrap_or("list"),
                &input["data"],
            ),
            "eval_save" => {
                let dataset = input["kind"] == "dataset";
                let data = if dataset {
                    logs::insights::evaluations::library(&mut db, "dataset", &input["data"])?
                } else {
                    logs::insights::evaluations::bundle(&input["data"])?
                };
                if data["cases"].as_array().is_none_or(|rows| rows.is_empty()) {
                    return Err("There are no approved cases for this export.".into());
                }
                let Some(file) = app
                    .dialog()
                    .file()
                    .add_filter("JSON", &["json"])
                    .set_file_name(if dataset {
                        "agentlens-eval-dataset.json"
                    } else {
                        "agentlens-eval-cases.json"
                    })
                    .blocking_save_file()
                else {
                    return Ok(serde_json::Value::Bool(false));
                };
                let path = file.into_path().map_err(|e| e.to_string())?;
                if !path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
                {
                    return Err("Choose a .json file.".into());
                }
                std::fs::write(
                    path,
                    serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?,
                )
                .map_err(|e| e.to_string())?;
                Ok(serde_json::Value::Bool(true))
            }
            "feedback" => logs::insights::feedback(
                &db,
                input["action"].as_str().unwrap_or("list"),
                input["item"].clone(),
            ),
            _ => Err("Unsupported Insights action".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenTrace::default())
        .invoke_handler(tauri::generate_handler![
            demo_records,
            local_sessions,
            read_session,
            choose_folder,
            import_chatgpt,
            save_diagnostics,
            trace_configured,
            open_codex_trace,
            read_codex_trace_request,
            close_codex_trace,
            agent_insights
        ])
        .run(tauri::generate_context!())
        .expect("could not start AgentLens");
}
