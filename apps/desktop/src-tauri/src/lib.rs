use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const DEFAULT_SERVICE_URL: &str = "ws://127.0.0.1:4317";
const LOG_LIMIT: usize = 200;
const READY_TIMEOUT: Duration = Duration::from_secs(10);
const HEALTH_INTERVAL: Duration = Duration::from_secs(5);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServiceStatus {
    running: bool,
    pid: Option<u32>,
    url: String,
    error: Option<String>,
    healthy: bool,
}

impl Default for ServiceStatus {
    fn default() -> Self {
        Self {
            running: false,
            pid: None,
            url: DEFAULT_SERVICE_URL.to_string(),
            error: None,
            healthy: false,
        }
    }
}

struct ServiceState {
    child: Mutex<Option<Child>>,
    status: Mutex<ServiceStatus>,
    desired_running: Mutex<bool>,
    logs: Mutex<VecDeque<String>>,
    started_at: Mutex<Option<Instant>>,
    ready_at: Mutex<Option<Instant>>,
}

impl Default for ServiceState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(ServiceStatus::default()),
            desired_running: Mutex::new(false),
            logs: Mutex::new(VecDeque::new()),
            started_at: Mutex::new(None),
            ready_at: Mutex::new(None),
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

fn runtime_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    }
}

fn service_node(app: &AppHandle) -> PathBuf {
    if let Ok(path) = std::env::var("VELA_NODE") {
        return PathBuf::from(path);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("runtime").join(runtime_name());
        if bundled.exists() {
            return bundled;
        }
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("runtime")
        .join(runtime_name());
    if dev.exists() {
        return dev;
    }

    PathBuf::from(runtime_name())
}

fn push_log(app: &AppHandle, state: &ServiceState, line: String) {
    {
        let mut logs = state.logs.lock().unwrap();
        logs.push_back(line.clone());
        while logs.len() > LOG_LIMIT {
            logs.pop_front();
        }
    }
    let _ = app.emit("service://log", line);
}

fn emit_status(app: &AppHandle, state: &ServiceState) {
    let status = state.status.lock().unwrap().clone();
    let _ = app.emit("service://status", status);
}

fn mark_ready(app: &AppHandle, state: &ServiceState, url: &str) {
    {
        let mut status = state.status.lock().unwrap();
        status.url = url.to_string();
        status.healthy = true;
    }
    *state.ready_at.lock().unwrap() = Some(Instant::now());
    emit_status(app, state);
}

fn set_running(
    app: &AppHandle,
    state: &ServiceState,
    running: bool,
    pid: Option<u32>,
    error: Option<String>,
) {
    {
        let mut status = state.status.lock().unwrap();
        status.running = running;
        status.pid = pid;
        status.error = error;
        if !running {
            status.healthy = false;
        }
    }
    emit_status(app, state);
}

fn tcp_healthy(url: &str) -> bool {
    let endpoint = url
        .strip_prefix("ws://")
        .or_else(|| url.strip_prefix("wss://"))
        .unwrap_or(url);
    let endpoint = endpoint.split('/').next().unwrap_or(endpoint);
    let Ok(addresses) = endpoint.to_socket_addrs() else {
        return false;
    };

    addresses.into_iter().any(|address| {
        TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok()
    })
}

fn start_service(app: &AppHandle, state: &ServiceState) -> Result<ServiceStatus, String> {
    {
        let mut guard = state.child.lock().unwrap();
        let stale = match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(None) => false,
                _ => true,
            },
            None => false,
        };
        if stale {
            if let Some(mut child) = guard.take() {
                let _ = child.wait();
            }
        } else if guard.is_some() {
            drop(guard);
            return Ok(state.status.lock().unwrap().clone());
        }
    }

    let script = service_script(app);
    if !script.exists() {
        *state.desired_running.lock().unwrap() = false;
        let message = format!("service script not found: {}", script.display());
        set_running(app, state, false, None, Some(message.clone()));
        return Err(message);
    }

    let node = service_node(app);
    let port = std::env::var("VELA_SERVICE_PORT").unwrap_or_else(|_| "0".to_string());
    let mut command = Command::new(&node);
    command
        .arg(&script)
        .env("VELA_PARENT_WATCH", "1")
        .env("VELA_SERVICE_PORT", &port)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        *state.desired_running.lock().unwrap() = false;
        let message = format!("failed to spawn {}: {error}", node.display());
        set_running(app, state, false, None, Some(message.clone()));
        message
    })?;
    let pid = child.id();

    if let Some(stdout) = child.stdout.take() {
        let app_handle = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let state = app_handle.state::<ServiceState>();
                push_log(&app_handle, state.inner(), line.clone());
                if let Some(payload) = line.strip_prefix("READY ") {
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) {
                        if let Some(url) = value.get("url").and_then(|value| value.as_str()) {
                            mark_ready(&app_handle, state.inner(), url);
                        }
                    }
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_handle = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let state = app_handle.state::<ServiceState>();
                push_log(&app_handle, state.inner(), line);
            }
        });
    }

    *state.child.lock().unwrap() = Some(child);
    *state.desired_running.lock().unwrap() = true;
    *state.started_at.lock().unwrap() = Some(Instant::now());
    *state.ready_at.lock().unwrap() = None;
    set_running(app, state, true, Some(pid), None);
    Ok(state.status.lock().unwrap().clone())
}

fn stop_service(app: &AppHandle, state: &ServiceState) {
    *state.desired_running.lock().unwrap() = false;
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(mut process) = guard.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
    *state.started_at.lock().unwrap() = None;
    *state.ready_at.lock().unwrap() = None;
    set_running(app, state, false, None, None);
}

fn restart_service(app: &AppHandle, state: &ServiceState) -> Result<ServiceStatus, String> {
    stop_service(app, state);
    start_service(app, state)
}

fn spawn_watchdog(app: AppHandle) {
    thread::spawn(move || {
        let mut last_health = Instant::now();
        loop {
            thread::sleep(Duration::from_secs(2));
            let state = app.state::<ServiceState>();
            if !*state.desired_running.lock().unwrap() {
                continue;
            }

            let dead = {
                let mut guard = state.child.lock().unwrap();
                match guard.as_mut() {
                    Some(child) => !matches!(child.try_wait(), Ok(None)),
                    None => true,
                }
            };
            let started = *state.started_at.lock().unwrap();
            let ready = *state.ready_at.lock().unwrap();
            let status = state.status.lock().unwrap().clone();

            let startup_timed_out = ready.is_none()
                && started
                    .map(|started_at| started_at.elapsed() > READY_TIMEOUT)
                    .unwrap_or(false);

            let mut unhealthy = false;
            if ready.is_some() && last_health.elapsed() >= HEALTH_INTERVAL {
                last_health = Instant::now();
                unhealthy = !tcp_healthy(&status.url);
            }

            if dead || startup_timed_out || unhealthy {
                let reason = if dead {
                    "process exited"
                } else if startup_timed_out {
                    "service did not become ready"
                } else {
                    "health check failed"
                };
                push_log(
                    &app,
                    state.inner(),
                    format!("[supervisor] {reason}; restarting service"),
                );
                stop_service(&app, state.inner());
                *state.desired_running.lock().unwrap() = true;
                if let Err(error) = start_service(&app, state.inner()) {
                    push_log(
                        &app,
                        state.inner(),
                        format!("[supervisor] restart failed: {error}"),
                    );
                }
                last_health = Instant::now();
            }
        }
    });
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
    restart_service(&app, state.inner())
}

#[tauri::command]
fn service_health(state: State<ServiceState>) -> bool {
    let status = state.status.lock().unwrap().clone();
    if !status.running {
        return false;
    }
    tcp_healthy(&status.url)
}

#[tauri::command]
fn service_logs(state: State<ServiceState>) -> Vec<String> {
    state.logs.lock().unwrap().iter().cloned().collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(ServiceState::default())
        .invoke_handler(tauri::generate_handler![
            service_status,
            service_start,
            service_stop,
            service_restart,
            service_health,
            service_logs
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<ServiceState>();
            if let Err(error) = start_service(&handle, state.inner()) {
                eprintln!("[vela] {error}");
            }
            spawn_watchdog(handle);

            if std::env::var("VELA_TEST_NOTIFICATION").as_deref() == Ok("1") {
                use tauri_plugin_notification::NotificationExt;
                match app
                    .notification()
                    .builder()
                    .title("Vela")
                    .body("System notifications are wired.")
                    .show()
                {
                    Ok(()) => eprintln!("[vela] test notification sent"),
                    Err(error) => eprintln!("[vela] test notification failed: {error}"),
                }
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
