#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;

use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

mod settings;
mod window_state;

/// Writes a base64-encoded file (e.g. an exported PDF) to a user-chosen path
/// coming from the save dialog. Runs with extension and destination validation.
#[tauri::command]
fn save_pdf_file(path: String, data_b64: String) -> Result<(), String> {
    let p = Path::new(&path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "pdf" && ext != "md" && ext != "png" && ext != "zip" {
        return Err("Only .pdf, .md, .png, and .zip file exports are permitted".into());
    }

    let path_str = path.to_lowercase();
    if path_str.contains("/.ssh")
        || path_str.contains("/.aws")
        || path_str.contains("/.bash")
        || path_str.contains("/.zsh")
        || path_str.starts_with("/etc")
        || path_str.starts_with("/system")
        || path_str.starts_with("/usr")
        || path_str.starts_with("/bin")
        || path_str.starts_with("/sbin")
    {
        return Err("Saving to restricted system directories is not allowed".into());
    }

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

    // 0. Custom data_dir from settings.json
    if let Some(val) = settings::get_setting_value(app, "data_dir") {
        if let Some(str_path) = val.as_str() {
            let p = PathBuf::from(str_path).join("courses").join(&lower_id);
            if p.exists() {
                return Some(p);
            }
        }
    }

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
    if course_id.is_empty()
        || course_id.len() > 64
        || !course_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Invalid course ID".into());
    }

    let target_dir = find_course_dir(&app, &course_id)
        .ok_or_else(|| format!("Course folder for '{course_id}' could not be located."))?;

    let dir_to_open = if let Some(p) = path {
        let candidate = PathBuf::from(&p);
        if candidate.exists() && (candidate.starts_with(&target_dir) || target_dir.starts_with(&candidate)) {
            candidate
        } else {
            target_dir
        }
    } else {
        target_dir
    };

    if !dir_to_open.exists() {
        let _ = std::fs::create_dir_all(&dir_to_open);
    }

    open_directory(&dir_to_open)
}

struct BackendProcess(std::sync::Mutex<Option<std::process::Child>>);

fn get_default_data_dir(app: &tauri::App) -> PathBuf {
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("data").exists() {
            return cwd.join("data");
        } else if cwd.join("..").join("data").exists() {
            return cwd.join("..").join("data");
        }
    }
    app.path()
        .app_data_dir()
        .map(|d| d.join("data"))
        .unwrap_or_else(|_| PathBuf::from("./data"))
}

fn start_backend_process(app: &tauri::App) -> Option<std::process::Child> {
    let data_dir = if let Some(val) = settings::get_setting_value(app.handle(), "data_dir") {
        if let Some(s) = val.as_str() {
            PathBuf::from(s)
        } else {
            get_default_data_dir(app)
        }
    } else if let Ok(d) = std::env::var("DATA_DIR") {
        PathBuf::from(d)
    } else {
        get_default_data_dir(app)
    };

    let mut cmd: Option<Command> = None;

    // 1. Check for bundled binary in resource dir
    if let Ok(res_dir) = app.path().resource_dir() {
        let binary_candidates = [
            res_dir.join("server"),
            res_dir.join("bin").join("server"),
            res_dir.join("server-x86_64-apple-darwin"),
            res_dir.join("server-aarch64-apple-darwin"),
        ];
        for b in binary_candidates {
            if b.exists() {
                cmd = Some(Command::new(b));
                break;
            }
        }
    }

    // 2. Check alongside current executable
    if cmd.is_none() {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let binary_candidates = [
                    exe_dir.join("server"),
                    exe_dir.join("server-x86_64-apple-darwin"),
                    exe_dir.join("server-aarch64-apple-darwin"),
                ];
                for b in binary_candidates {
                    if b.exists() {
                        cmd = Some(Command::new(b));
                        break;
                    }
                }
            }
        }
    }

    // 3. Fallback: check for bun on PATH or standard directories
    if cmd.is_none() {
        let bun_paths = ["/usr/local/bin/bun", "/opt/homebrew/bin/bun"];
        let mut bun_bin: Option<String> = None;
        for bp in bun_paths {
            if Path::new(bp).exists() {
                bun_bin = Some(bp.to_string());
                break;
            }
        }

        if bun_bin.is_none() {
            if let Ok(home) = std::env::var("HOME") {
                let bp = PathBuf::from(home).join(".bun").join("bin").join("bun");
                if bp.exists() {
                    bun_bin = Some(bp.to_string_lossy().to_string());
                }
            }
        }

        let bun_executable = bun_bin.unwrap_or_else(|| "bun".to_string());

        if let Ok(cwd) = std::env::current_dir() {
            let script_candidates = [
                cwd.join("server").join("index.ts"),
                cwd.join("..").join("server").join("index.ts"),
            ];
            for sc in script_candidates {
                if sc.exists() {
                    let mut c = Command::new(&bun_executable);
                    c.arg("run").arg(sc);
                    cmd = Some(c);
                    break;
                }
            }
        }
    }

    if let Some(mut command) = cmd {
        command.env("PORT", "3182");
        command.env("DATA_DIR", data_dir);
        command.stdout(std::process::Stdio::null());
        command.stderr(std::process::Stdio::null());
        match command.spawn() {
            Ok(child) => {
                println!("[Tauri] Backend server started successfully (pid: {})", child.id());
                Some(child)
            }
            Err(e) => {
                eprintln!("[Tauri] Failed to start backend server: {e}");
                None
            }
        }
    } else {
        println!("[Tauri] Backend server binary or script not found, skipping auto-spawn.");
        None
    }
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
            // Start local backend server for packaged app
            let child = start_backend_process(app);
            app.manage(BackendProcess(std::sync::Mutex::new(child)));

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
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                if let Some(proc) = app_handle.try_state::<BackendProcess>() {
                    if let Ok(mut lock) = proc.0.lock() {
                        if let Some(mut child) = lock.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
