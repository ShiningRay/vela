use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const SERVICE_URL: &str = "ws://127.0.0.1:4317";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    running: bool,
    pid: Option<u32>,
    url: String,
    error: Option<String>,
}

impl Default for ServiceStatus {
    fn default() -> Self {
        Self {
            running: false,
            pid: None,
            url: SERVICE_URL.to_string(),
            error: None,
        }
    }
}

struct ServiceState {
    child: Mutex<Option<Child>>,
    status: Mutex<ServiceStatus>,
}

impl Default for ServiceState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(ServiceStatus::default()),
        }
    }
}

fn service_script(app: &AppHandle) -> PathBuf {
    if let Ok(path) = std::env::var("VELA_SERVICE_SCRIPT") {
        return PathBuf::from(path);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("services/demo/server.cjs");
        if bundled.exists() {
            return bundled;
        }
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../services/demo/dist/server.cjs")
}

fn update_status(
    app: &AppHandle,
    state: &ServiceState,
    running: bool,
    pid: Option<u32>,
    error: Option<String>,
) {
    let status = ServiceStatus {
        running,
        pid,
        url: SERVICE_URL.to_string(),
        error,
    };
    *state.status.lock().unwrap() = status.clone();
    let _ = app.emit("service://status", status);
}

fn start_service(app: &AppHandle, state: &ServiceState) -> Result<ServiceStatus, String> {
    {
        let mut guard = state.child.lock().unwrap();
        let running = matches!(
            guard.as_mut().map(|process| process.try_wait()),
            Some(Ok(None))
        );
        if running {
            drop(guard);
            return Ok(state.status.lock().unwrap().clone());
        }
        *guard = None;
    }

    let script = service_script(app);
    if !script.exists() {
        let message = format!("service script not found: {}", script.display());
        update_status(app, state, false, None, Some(message.clone()));
        return Err(message);
    }

    let node = std::env::var("VELA_NODE").unwrap_or_else(|_| "node".to_string());
    let mut command = Command::new(&node);
    command
        .arg(&script)
        .env("VELA_PARENT_WATCH", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        let message = format!("failed to spawn {node}: {error}");
        update_status(app, state, false, None, Some(message.clone()));
        message
    })?;
    let pid = child.id();

    if let Some(stdout) = child.stdout.take() {
        let app_handle = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = app_handle.emit("service://log", line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_handle = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app_handle.emit("service://log", line);
            }
        });
    }

    *state.child.lock().unwrap() = Some(child);
    update_status(app, state, true, Some(pid), None);
    Ok(state.status.lock().unwrap().clone())
}

fn stop_service(app: &AppHandle, state: &ServiceState) {
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(mut process) = guard.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
    update_status(app, state, false, None, None);
}

#[tauri::command]
fn service_status(state: State<ServiceState>) -> ServiceStatus {
    state.status.lock().unwrap().clone()
}

#[tauri::command]
fn service_start(app: AppHandle, state: State<ServiceState>) -> Result<ServiceStatus, String> {
    start_service(&app, state.inner())
}

#[tauri::command]
fn service_stop(app: AppHandle, state: State<ServiceState>) -> ServiceStatus {
    stop_service(&app, state.inner());
    state.status.lock().unwrap().clone()
}

#[tauri::command]
fn service_restart(app: AppHandle, state: State<ServiceState>) -> Result<ServiceStatus, String> {
    stop_service(&app, state.inner());
    start_service(&app, state.inner())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(ServiceState::default())
        .invoke_handler(tauri::generate_handler![
            service_status,
            service_start,
            service_stop,
            service_restart
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<ServiceState>();
            if let Err(error) = start_service(&handle, state.inner()) {
                eprintln!("[vela] {error}");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Vela Desktop");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state = app_handle.state::<ServiceState>();
            stop_service(app_handle, state.inner());
        }
    });
}
