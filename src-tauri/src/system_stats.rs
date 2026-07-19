use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessesToUpdate, System};

static APP_START: OnceLock<Instant> = OnceLock::new();
static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();

fn app_start() -> &'static Instant {
    APP_START.get_or_init(Instant::now)
}

fn system() -> &'static Mutex<System> {
    SYSTEM.get_or_init(|| Mutex::new(System::new()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu_percent: Option<f64>,
    pub memory_mb: Option<f64>,
    pub uptime_secs: u64,
    pub pid: u32,
}

#[tauri::command]
pub async fn get_system_stats() -> SystemStats {
    let pid = std::process::id();
    let uptime_secs = app_start().elapsed().as_secs();
    let pid_typed = Pid::from_u32(pid);

    // sysinfo can touch a lot of /proc; keep it off the async runtime thread.
    tokio::task::spawn_blocking(move || {
        {
            if let Ok(mut sys) = system().lock() {
                sys.refresh_processes(ProcessesToUpdate::Some(&[pid_typed]), true);
            }
        }
        std::thread::sleep(Duration::from_millis(80));

        let mut cpu_percent: Option<f64> = None;
        let mut memory_mb: Option<f64> = None;

        if let Ok(mut sys) = system().lock() {
            sys.refresh_processes(ProcessesToUpdate::Some(&[pid_typed]), true);
            if let Some(process) = sys.process(pid_typed) {
                cpu_percent = Some(f64::from(process.cpu_usage()));
                memory_mb = Some(process.memory() as f64 / (1024.0 * 1024.0));
            }
        }

        SystemStats {
            cpu_percent,
            memory_mb,
            uptime_secs,
            pid,
        }
    })
    .await
    .unwrap_or(SystemStats {
        cpu_percent: None,
        memory_mb: None,
        uptime_secs,
        pid,
    })
}
