#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

fn workspace_root(slug: &str) -> Result<PathBuf, String> {
    let home = dirs_next_home().ok_or_else(|| "home directory not found".to_string())?;
    let clean: String = slug
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    if clean.is_empty() {
        return Err("empty employee slug".to_string());
    }
    Ok(home.join("klawva").join("employees").join(clean))
}

fn dirs_next_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
}

fn safe_join(root: &PathBuf, relative: &str) -> Result<PathBuf, String> {
    let path = root.join(relative);
    let root_canon = root.canonicalize().map_err(|e| e.to_string())?;
    let parent = path.parent().ok_or_else(|| "bad path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let parent_canon = parent.canonicalize().map_err(|e| e.to_string())?;
    if !parent_canon.starts_with(&root_canon) {
        return Err("path escapes the workspace".to_string());
    }
    Ok(path)
}

#[tauri::command]
fn ensure_workspace(slug: String) -> Result<String, String> {
    let root = workspace_root(&slug)?;
    for dir in ["notes", "output", "tmp"] {
        fs::create_dir_all(root.join(dir)).map_err(|e| e.to_string())?;
    }
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
fn write_note(slug: String, name: String, contents: String) -> Result<(), String> {
    let root = workspace_root(&slug)?;
    fs::create_dir_all(root.join("notes")).map_err(|e| e.to_string())?;
    let path = safe_join(&root, &format!("notes/{}", name))?;
    let mut existing = fs::read_to_string(&path).unwrap_or_default();
    existing.push_str(&contents);
    fs::write(&path, existing).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_workspace_file(slug: String, relative_path: String) -> Result<String, String> {
    let root = workspace_root(&slug)?;
    let path = safe_join(&root, &relative_path)?;
    let root_canon = root.canonicalize().map_err(|e| e.to_string())?;
    let file_canon = path.canonicalize().map_err(|e| e.to_string())?;
    if !file_canon.starts_with(&root_canon) {
        return Err("path escapes the workspace".to_string());
    }
    fs::read_to_string(&file_canon).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_workspace_files(slug: String, relative_dir: String) -> Result<Vec<String>, String> {
    let root = workspace_root(&slug)?;
    let dir = safe_join(&root, &relative_dir)?;
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        names.push(entry.file_name().to_string_lossy().into_owned());
    }
    names.sort();
    Ok(names)
}

fn main() {
    if std::env::args().any(|arg| arg == "--smoke") {
        println!("klawva desktop smoke ok");
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_websocket::init())
        .invoke_handler(tauri::generate_handler![
            ensure_workspace,
            write_note,
            read_workspace_file,
            list_workspace_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running klawva desktop");
}
