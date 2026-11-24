mod store;

use tauri::Manager;

#[tauri::command]
fn demo_records(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    store::demo(&mut store::open(&dir.join("demo.sqlite3"))?)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![demo_records])
        .run(tauri::generate_context!())
        .expect("could not start AgentLens");
}
