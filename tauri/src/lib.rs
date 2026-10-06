#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;

use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

mod settings;
mod window_state;

/// Writes a base64-encoded file (e.g. an exported PDF) to a user-chosen path
/// coming from the save dialog. Runs outside the fs-plugin ACL on purpose.
#[tauri::command]
fn save_pdf_file(path: String, data_b64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|e| format!("invalid base64 payload: {e}"))?;
    std::fs::write(&path, bytes).map_err(|e| format!("failed to write '{path}': {e}"))
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn open_directory(path: &Path) -> Result<(), String> {
    let mut command = if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.arg(path);
        command
    } else if cfg!(target_os = "windows") {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    } else {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    let status = command.status().map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Failed to open course folder (exit code {:?})",
            status.code()
        ))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn open_directory(_path: &Path) -> Result<(), String> {
    Err("Opening directories is not supported on this platform".to_string())
}

fn find_course_dir(app: &tauri::AppHandle, course_id: &str) -> Option<PathBuf> {
    let lower_id = course_id.to_lowercase();

    // 1. Env variable DATA_DIR
    if let Ok(data_env) = std::env::var("DATA_DIR") {
        let p = PathBuf::from(data_env).join("courses").join(&lower_id);
        if p.exists() {
            return Some(p);
        }
    }

    // 2. Relative to current working dir
    if let Ok(cwd) = std::env::current_dir() {
        let candidates = [
            cwd.join("data").join("courses").join(&lower_id),
            cwd.join("..").join("data").join("courses").join(&lower_id),
            cwd.join("courses").join(&lower_id),
        ];
        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
    }

    // 3. App data directory
    if let Ok(app_data) = app.path().app_data_dir() {
        let candidates = [
            app_data.join("data").join("courses").join(&lower_id),
            app_data.join("courses").join(&lower_id),
        ];
        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
    }

    // 4. Resource directory
    if let Ok(res) = app.path().resource_dir() {
        let candidates = [
            res.join("data").join("courses").join(&lower_id),
            res.join("courses").join(&lower_id),
        ];
        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
    }

    // Fallback: If not existing yet, candidate in cwd
    if let Ok(cwd) = std::env::current_dir() {
        let candidate_parent = cwd.join("..").join("data").join("courses");
        if candidate_parent.exists() {
            return Some(candidate_parent.join(&lower_id));
        }
        Some(cwd.join("data").join("courses").join(&lower_id))
    } else {
        None
    }
}

#[tauri::command]
fn open_course_folder(app: tauri::AppHandle, course_id: String, path: Option<String>) -> Result<(), String> {
    if let Some(p) = path {
        let pbuf = PathBuf::from(&p);
        if pbuf.exists() {
            return open_directory(&pbuf);
        }
    }

    let dir = find_course_dir(&app, &course_id)
        .ok_or_else(|| format!("Course folder for '{course_id}' could not be located."))?;

    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }

    open_directory(&dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            settings::get_setting,
            settings::set_setting,
            save_pdf_file,
            open_course_folder
        ]);

    builder
        .setup(|app| {
            #[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
            {
                let _ = app.deep_link().register_all();

                // Custom window state restore
                let app_handle_restore = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(150));
                    let app_clone = app_handle_restore.clone();
                    let _ = app_handle_restore.run_on_main_thread(move || {
                        window_state::restore_window(&app_clone, "main");
                    });
                });

                // Wire up automatic state persistence
                window_state::watch_window(app.handle(), "main");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
