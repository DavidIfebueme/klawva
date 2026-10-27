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

static LOOPBACK_RESULT: std::sync::Mutex<Option<Result<String, String>>> =
    std::sync::Mutex::new(None);

#[tauri::command]
fn start_loopback(expected_state: String) -> Result<u16, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    std::thread::spawn(move || {
        let outcome = (|| -> Result<String, String> {
            let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
            let mut buffer = [0u8; 8192];
            let read = stream.read(&mut buffer).map_err(|e| e.to_string())?;
            let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
            let first_line = request.lines().next().unwrap_or_default();
            let query = first_line
                .split_whitespace()
                .nth(1)
                .and_then(|path| path.splitn(2, '?').nth(1))
                .unwrap_or_default()
                .to_string();
            let state = query
                .split('&')
                .find_map(|pair| pair.strip_prefix("state="))
                .unwrap_or_default();
            let body = if state == expected_state {
                "<html><body><p>klawva is connected. you can close this tab.</p></body></html>"
            } else {
                "<html><body><p>state mismatch. try pairing again from the app.</p></body></html>"
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            if state != expected_state {
                return Err("state mismatch".to_string());
            }
            Ok(query)
        })();
        if let Ok(mut slot) = LOOPBACK_RESULT.lock() {
            *slot = Some(outcome);
        }
    });
    Ok(port)
}

#[tauri::command]
fn take_loopback_result() -> Option<Result<String, String>> {
    LOOPBACK_RESULT.lock().ok().and_then(|mut slot| slot.take())
}

#[cfg(windows)]
mod vault {
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        }
    }

    pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let mut output = blob(&[]);
            CryptProtectData(&blob(plain), None, None, None, None, 0, &mut output)
                .map_err(|e| e.to_string())?;
            Ok(std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec())
        }
    }

    pub fn unprotect(cipher: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let mut output = blob(&[]);
            CryptUnprotectData(&blob(cipher), None, None, None, None, 0, &mut output)
                .map_err(|e| e.to_string())?;
            Ok(std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec())
        }
    }
}

#[cfg(not(windows))]
mod vault {
    pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
        Ok(plain.to_vec())
    }

    pub fn unprotect(cipher: &[u8]) -> Result<Vec<u8>, String> {
        Ok(cipher.to_vec())
    }
}

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

#[tauri::command]
fn store_secret(name: String, value: String) -> Result<(), String> {
    let home = dirs_next_home().ok_or_else(|| "home directory not found".to_string())?;
    let dir = home.join("klawva").join("vault");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let clean: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let cipher = vault::protect(value.as_bytes())?;
    let path = dir.join(format!("{}.secret", clean));
    fs::write(&path, URL_SAFE_NO_PAD.encode(cipher)).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&path).map_err(|e| e.to_string())?.permissions();
        permissions.set_mode(0o600);
        fs::set_permissions(&path, permissions).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn read_secret(name: String) -> Result<Option<String>, String> {
    let home = dirs_next_home().ok_or_else(|| "home directory not found".to_string())?;
    let clean: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let path = home.join("klawva").join("vault").join(format!("{}.secret", clean));
    let encoded = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(_) => return Ok(None),
    };
    let cipher = URL_SAFE_NO_PAD
        .decode(encoded.trim())
        .map_err(|e| e.to_string())?;
    let plain = vault::unprotect(&cipher)?;
    String::from_utf8(plain)
        .map(Some)
        .map_err(|e| e.to_string())
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

#[tauri::command]
fn bundle_spawn(entrypoint: String, port: u16, nonce: String, bundle_id: String) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    if port < 1024 || nonce.len() < 32 {
        return Err("bad spawn plan".to_string());
    }
    let mut child = Command::new(&entrypoint)
        .env("KLAWVA_BUNDLE_ID", &bundle_id)
        .env("KLAWVA_A2A_PORT", port.to_string())
        .env("KLAWVA_A2A_NONCE", &nonce)
        .env("KLAWVA_A2A_TRANSPORT", "a2a-loopback")
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    if reader.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
        return Err("bundle produced no handshake line".to_string());
    }
    let trimmed = line.trim().to_string();
    if !trimmed.contains(&nonce) {
        let _ = child.kill();
        return Err("bundle did not echo the nonce".to_string());
    }
    BUNDLE_CHILD
        .lock()
        .map_err(|e| e.to_string())?
        .replace(child);
    Ok(trimmed)
}

static BUNDLE_CHILD: std::sync::Mutex<Option<std::process::Child>> =
    std::sync::Mutex::new(None);

#[tauri::command]
fn bundle_kill() -> Result<bool, String> {
    let mut guard = BUNDLE_CHILD.lock().map_err(|e| e.to_string())?;
    match guard.take() {
        Some(mut child) => {
            let pid = child.id();
            let _ = child.kill();
            let _ = child.wait();
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/T", "/F", "/PID", &pid.to_string()])
                    .output();
            }
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
fn bundle_spawn_plan(port: u16, nonce: String, bundle_id: String) -> Result<String, String> {
    if port < 1024 {
        return Err("port must be unprivileged".to_string());
    }
    if nonce.len() < 32 {
        return Err("nonce too short".to_string());
    }
    Ok(serde_json::json!({
        "port": port,
        "nonce": nonce,
        "env": {
            "KLAWVA_BUNDLE_ID": bundle_id,
            "KLAWVA_A2A_PORT": port.to_string(),
            "KLAWVA_A2A_NONCE": nonce,
            "KLAWVA_A2A_TRANSPORT": "a2a-loopback"
        }
    })
    .to_string())
}

#[tauri::command]
fn purge_bundle_data(dirs: Vec<String>, allowed_root: String) -> Result<Vec<String>, String> {
    let root = std::path::PathBuf::from(&allowed_root);
    let root_canon = root.canonicalize().map_err(|e| e.to_string())?;
    let mut removed = Vec::new();
    for dir in dirs {
        let path = std::path::PathBuf::from(&dir);
        if path.is_absolute() || dir.contains("..") {
            return Err(format!("refusing to purge outside scope: {dir}"));
        }
        let full = root.join(&path);
        if !full.exists() {
            continue;
        }
        let canon = full.canonicalize().map_err(|e| e.to_string())?;
        if !canon.starts_with(&root_canon) {
            return Err(format!("refusing to purge outside scope: {dir}"));
        }
        fs::remove_dir_all(&canon).map_err(|e| e.to_string())?;
        removed.push(dir);
    }
    Ok(removed)
}

#[tauri::command]
fn verify_report(line: String, exit_code: Option<i32>) {
    println!("{line}");
    if let Some(code) = exit_code {
        std::process::exit(code);
    }
}

#[tauri::command]
fn verify_exit(code: i32) {
    std::process::exit(code);
}

use tauri::Manager;

fn main() {
    if std::env::args().any(|arg| arg == "--smoke") {
        println!("klawva desktop smoke ok");
        return;
    }
    let verifying = std::env::args().any(|arg| arg == "--verify");
    if verifying {
        match std::env::var("KLAWVA_WORKER_URL") {
            Ok(url) if !url.contains("klawva.xyz") => {}
            _ => {
                eprintln!("--verify needs KLAWVA_WORKER_URL pointing at a non-production worker");
                std::process::exit(2);
            }
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_websocket::init())
        .setup(move |app| {
            if verifying {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    match handle.get_webview_window("main") {
                        Some(window) => {
                            let _ = window.eval("location.replace('index.html?verify=1')");
                        }
                        None => {
                            eprintln!("verify: no webview to drive");
                            std::process::exit(1);
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_secs(180));
                    eprintln!("verify: timed out waiting for the pairing loop");
                    std::process::exit(1);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ensure_workspace,
            write_note,
            read_workspace_file,
            list_workspace_files,
            start_loopback,
            take_loopback_result,
            store_secret,
            read_secret,
            verify_report,
            verify_exit,
            purge_bundle_data,
            bundle_spawn_plan,
            bundle_spawn,
            bundle_kill
        ])
        .run(tauri::generate_context!())
        .expect("error while running klawva desktop");
}
