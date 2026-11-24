mod logs;
mod store;

use std::{path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

#[derive(Default)]
struct LogFolders(Mutex<Vec<(PathBuf, logs::Provider)>>);

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
async fn local_sessions(
    app: tauri::AppHandle,
    folders: State<'_, LogFolders>,
) -> Result<Vec<logs::Session>, String> {
    let extra = folders.0.lock().map_err(|e| e.to_string())?.clone();
    let db = logs::open(&data_dir(&app)?.join("sessions.sqlite3"))?;
    Ok(logs::list(&db, &extra))
}

#[tauri::command]
async fn read_session(
    app: tauri::AppHandle,
    folders: State<'_, LogFolders>,
    key: String,
) -> Result<serde_json::Value, String> {
    let extra = folders.0.lock().map_err(|e| e.to_string())?.clone();
    let mut db = logs::open(&data_dir(&app)?.join("sessions.sqlite3"))?;
    logs::session(&mut db, &key, &extra)
}

fn main() {
    tauri::Builder::default()
        .manage(LogFolders::default())
        .invoke_handler(tauri::generate_handler![
            demo_records,
            local_sessions,
            read_session
        ])
        .run(tauri::generate_context!())
        .expect("could not start AgentLens");
}
