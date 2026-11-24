mod logs;
mod store;

use std::path::PathBuf;
use tauri::Manager;
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            demo_records,
            local_sessions,
            read_session,
            choose_folder,
            import_chatgpt
        ])
        .run(tauri::generate_context!())
        .expect("could not start AgentLens");
}
