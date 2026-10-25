pub mod monitor;
mod storage;
use serde_json::Value;
use std::{fs, io::Write};
use tauri::{AppHandle, Manager};

const MAX_PREFERENCES: usize = 65_536;

fn validate(value: &Value) -> Result<(), String> {
    if value.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("Unsupported preferences version".into());
    }
    if serde_json::to_vec(value)
        .map_err(|_| "Invalid preferences")?
        .len()
        > MAX_PREFERENCES
    {
        return Err("Preferences exceed size limit".into());
    }
    let object = value.as_object().ok_or("Preferences must be an object")?;
    let allowed = [
        "version",
        "demo",
        "fps",
        "effects",
        "reducedMotion",
        "theme",
        "sound",
        "notifications",
        "furniture",
        "appearances",
        "assignments",
    ];
    if object.len() != allowed.len() || object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err("Unexpected preference fields".into());
    }
    for key in ["demo", "effects", "reducedMotion", "sound", "notifications"] {
        if !value[key].is_boolean() {
            return Err("Invalid preference switch".into());
        }
    }
    if !matches!(value["fps"].as_u64(), Some(15 | 30 | 60)) {
        return Err("Invalid frame rate".into());
    }
    if !matches!(value["theme"].as_str(), Some("maple" | "dusk")) {
        return Err("Invalid office palette".into());
    }
    let furniture = value["furniture"].as_array().ok_or("Invalid furniture")?;
    if furniture.len() != 4 {
        return Err("Four desks are required".into());
    }
    let mut ids = std::collections::HashSet::new();
    for desk in furniture {
        let fields = desk.as_object().ok_or("Invalid desk")?;
        if fields.len() != 3
            || !fields.contains_key("id")
            || !fields.contains_key("x")
            || !fields.contains_key("y")
        {
            return Err("Unexpected desk fields".into());
        }
        let id = desk["id"].as_str().ok_or("Invalid desk ID")?;
        if !["desk-1", "desk-2", "desk-3", "desk-4"].contains(&id) || !ids.insert(id) {
            return Err("Invalid or duplicate desk ID".into());
        }
        if !desk["x"].as_i64().is_some_and(|x| (80..=350).contains(&x))
            || !desk["y"].as_i64().is_some_and(|y| (106..=264).contains(&y))
        {
            return Err("Desk position outside office".into());
        }
    }
    for (field, choices) in [
        ("appearances", ["mint", "peach", "blue", "gold"]),
        ("assignments", ["desk-1", "desk-2", "desk-3", "desk-4"]),
    ] {
        let mapping = value[field]
            .as_object()
            .ok_or("Invalid session preferences")?;
        for (key, item) in mapping {
            if key.len() > 128 || !item.as_str().is_some_and(|s| choices.contains(&s)) {
                return Err("Invalid session preference".into());
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn load_preferences(app: AppHandle) -> Result<Option<Value>, String> {
    let folder = data_folder(&app)?;
    let file = folder.join("preferences.json");
    if !file.exists() {
        return Ok(None);
    }
    let metadata = fs::metadata(&file).map_err(|_| "Cannot inspect preferences")?;
    if metadata.len() > MAX_PREFERENCES as u64 {
        return Err("Preferences exceed size limit".into());
    }
    let raw = fs::read(&file).map_err(|_| "Cannot read preferences")?;
    let value: Value = serde_json::from_slice(&raw).map_err(|_| "Preferences are corrupted")?;
    validate(&value)?;
    Ok(Some(value))
}

#[tauri::command]
fn save_preferences(app: AppHandle, preferences: Value) -> Result<(), String> {
    validate(&preferences)?;
    let folder = app
        .path()
        .app_config_dir()
        .map_err(|_| "Configuration directory unavailable")?;
    fs::create_dir_all(&folder).map_err(|_| "Cannot create configuration directory")?;
    let bytes = serde_json::to_vec_pretty(&preferences).map_err(|_| "Cannot encode preferences")?;
    let temporary = folder.join("preferences.tmp");
    let mut file = fs::File::create(&temporary).map_err(|_| "Cannot open temporary preferences")?;
    file.write_all(&bytes)
        .map_err(|_| "Cannot write preferences")?;
    file.sync_all().map_err(|_| "Cannot flush preferences")?;
    drop(file);
    storage::commit_file(&temporary, &folder.join("preferences.json"))
        .map_err(|_| "Cannot save preferences")?;
    Ok(())
}

fn data_folder(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if std::env::var_os("AI_WORKSPACE_DATA_DIR").is_some() {
        return Ok(monitor::default_folder());
    }
    app.path()
        .app_config_dir()
        .map_err(|_| "Configuration directory unavailable".into())
}
#[tauri::command]
fn monitor_snapshot(state: tauri::State<monitor::Monitor>) -> monitor::Snapshot {
    state.snapshot()
}
#[tauri::command]
fn start_browser_pairing(
    state: tauri::State<monitor::Monitor>,
) -> Result<monitor::PairCode, String> {
    state.pair_code()
}
#[tauri::command]
fn revoke_browser_pairing(state: tauri::State<monitor::Monitor>) -> Result<(), String> {
    state.revoke()
}
#[tauri::command]
fn install_project_hooks(
    project_dir: String,
    providers: Vec<monitor::model::Provider>,
) -> Result<Vec<String>, String> {
    let executable =
        std::env::current_exe().map_err(|_| "Cannot locate AI Workspace executable")?;
    monitor::hooks::install(std::path::Path::new(&project_dir), &providers, &executable)
}
pub fn report_hook(provider: monitor::model::Provider) {
    monitor::hooks::report(provider, monitor::default_folder());
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let folder = data_folder(app.handle()).map_err(std::io::Error::other)?;
            let service = monitor::Monitor::start(folder).map_err(std::io::Error::other)?;
            app.manage(service);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_preferences,
            save_preferences,
            monitor_snapshot,
            start_browser_pairing,
            revoke_browser_pairing,
            install_project_hooks
        ])
        .run(tauri::generate_context!())
        .expect("AI Workspace could not start");
}

#[cfg(test)]
mod tests {
    use super::*;
    fn preferences() -> Value {
        serde_json::json!({
            "version": 1, "demo": true, "fps": 60, "effects": true,
            "reducedMotion": false, "theme": "maple", "sound": false,
            "notifications": false,
            "furniture": [
                {"id": "desk-1", "x": 104, "y": 130},
                {"id": "desk-2", "x": 264, "y": 130},
                {"id": "desk-3", "x": 104, "y": 246},
                {"id": "desk-4", "x": 264, "y": 246}
            ],
            "appearances": {}, "assignments": {}
        })
    }
    #[test]
    fn rejects_unknown_version() {
        let mut p = preferences();
        p["version"] = 2.into();
        assert!(validate(&p).is_err());
    }
    #[test]
    fn rejects_large_preferences() {
        assert!(
            validate(&serde_json::json!({"version": 1, "text": "x".repeat(MAX_PREFERENCES)}))
                .is_err()
        );
    }
    #[test]
    fn accepts_complete_preferences() {
        assert!(validate(&preferences()).is_ok());
    }
    #[test]
    fn rejects_extra_fields() {
        let mut p = preferences();
        p["prompt"] = "private".into();
        assert!(validate(&p).is_err());
    }
    #[test]
    fn rejects_invalid_frame_rate() {
        let mut p = preferences();
        p["fps"] = 1000.into();
        assert!(validate(&p).is_err());
    }
    #[test]
    fn rejects_duplicate_desks() {
        let mut p = preferences();
        p["furniture"][1]["id"] = "desk-1".into();
        assert!(validate(&p).is_err());
    }
    #[test]
    fn rejects_invalid_appearance() {
        let mut p = preferences();
        p["appearances"]["demo:codex"] = "javascript".into();
        assert!(validate(&p).is_err());
    }
}
