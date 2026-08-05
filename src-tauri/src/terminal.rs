//! Interactive PTY sessions for the in-app terminal (xterm.js frontend).

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, State};

static SESSION_SEQ: AtomicU64 = AtomicU64::new(1);

pub struct TerminalState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputPayload {
    session_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitPayload {
    session_id: String,
    code: Option<i32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCreateResult {
    pub session_id: String,
    pub cwd: String,
    pub shell: String,
}

fn default_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn resolve_cwd(cwd: Option<String>) -> Result<PathBuf, String> {
    let candidate = match cwd {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => dirs_home().ok_or_else(|| "Unable to resolve home directory".to_string())?,
    };

    let canonical = candidate
        .canonicalize()
        .map_err(|e| format!("Invalid cwd '{}': {e}", candidate.display()))?;

    if !canonical.is_dir() {
        return Err(format!("cwd is not a directory: {}", canonical.display()));
    }

    Ok(canonical)
}

fn shell_basename(shell: &str) -> String {
    Path::new(shell)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| shell.to_string())
}

#[tauri::command]
pub fn terminal_create(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<TerminalCreateResult, String> {
    let cwd_path = resolve_cwd(cwd)?;
    let shell = default_shell();
    let session_id = format!("term-{}", SESSION_SEQ.fetch_add(1, Ordering::Relaxed));

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd_path);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell '{shell}': {e}"))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

    let session = PtySession {
        master: pair.master,
        writer: Mutex::new(writer),
        child: Mutex::new(child),
    };

    {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Terminal state lock poisoned".to_string())?;
        sessions.insert(session_id.clone(), session);
    }

    let app_out = app.clone();
    let sid_out = session_id.clone();
    thread::Builder::new()
        .name(format!("pty-read-{session_id}"))
        .spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        let _ = app_out.emit(
                            "terminal://output",
                            TerminalOutputPayload {
                                session_id: sid_out.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }

            let _ = app_out.emit(
                "terminal://exit",
                TerminalExitPayload {
                    session_id: sid_out,
                    code: None,
                },
            );
        })
        .map_err(|e| format!("Failed to spawn PTY reader thread: {e}"))?;

    Ok(TerminalCreateResult {
        session_id,
        cwd: cwd_path.to_string_lossy().into_owned(),
        shell: shell_basename(&shell),
    })
}

#[tauri::command]
pub fn terminal_write(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Unknown terminal session: {session_id}"))?;
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "PTY writer lock poisoned".to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {e}"))?;
    writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Unknown terminal session: {session_id}"))?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn terminal_kill(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    let Some(session) = sessions.remove(&session_id) else {
        return Ok(());
    };
    if let Ok(mut child) = session.child.lock() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}
