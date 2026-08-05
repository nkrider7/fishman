//! Live WebSocket sessions for the Fishman WebSocket client.
//!
//! Mirrors the terminal PTY model: each connection is a long-lived session
//! identified by a `session_id` (generated on the frontend so listeners can be
//! attached before the connection races to `open`). Outgoing frames are pushed
//! through an mpsc channel; incoming frames + lifecycle transitions are emitted
//! to the frontend as Tauri events routed by `session_id`.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::{HeaderName, HeaderValue};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;

const EVT_MESSAGE: &str = "websocket://message";
const EVT_STATUS: &str = "websocket://status";
const EVT_ERROR: &str = "websocket://error";

/// Cap outgoing frame size to avoid accidental huge allocations (16 MiB).
const MAX_OUTGOING_BYTES: usize = 16 * 1024 * 1024;

#[derive(Default)]
pub struct WsState {
    sessions: Arc<Mutex<HashMap<String, WsSessionHandle>>>,
}

struct WsSessionHandle {
    outgoing: mpsc::UnboundedSender<WsCommand>,
}

enum WsCommand {
    Text(String),
    Binary(Vec<u8>),
    Close { code: Option<u16>, reason: Option<String> },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsMessagePayload {
    session_id: String,
    direction: String,
    opcode: String,
    data: String,
    encoding: String,
    size: usize,
    timestamp: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsStatusPayload {
    session_id: String,
    status: String,
    code: Option<u16>,
    reason: Option<String>,
    timestamp: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WsErrorPayload {
    session_id: String,
    message: String,
    timestamp: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WsConnectResult {
    pub session_id: String,
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn emit_status(
    app: &AppHandle,
    session_id: &str,
    status: &str,
    code: Option<u16>,
    reason: Option<String>,
) {
    let _ = app.emit(
        EVT_STATUS,
        WsStatusPayload {
            session_id: session_id.to_string(),
            status: status.to_string(),
            code,
            reason,
            timestamp: now_ms(),
        },
    );
}

fn emit_error(app: &AppHandle, session_id: &str, message: String) {
    let _ = app.emit(
        EVT_ERROR,
        WsErrorPayload {
            session_id: session_id.to_string(),
            message,
            timestamp: now_ms(),
        },
    );
}

fn emit_incoming(app: &AppHandle, session_id: &str, msg: &Message) {
    let (opcode, data, encoding, size) = match msg {
        Message::Text(text) => {
            let s = text.to_string();
            let size = s.len();
            ("text", s, "utf8", size)
        }
        Message::Binary(bin) => {
            let size = bin.len();
            ("binary", BASE64.encode(bin), "base64", size)
        }
        Message::Ping(bin) => {
            let size = bin.len();
            ("ping", BASE64.encode(bin), "base64", size)
        }
        Message::Pong(bin) => {
            let size = bin.len();
            ("pong", BASE64.encode(bin), "base64", size)
        }
        Message::Close(frame) => {
            let reason = frame
                .as_ref()
                .map(|f| f.reason.to_string())
                .unwrap_or_default();
            let size = reason.len();
            ("close", reason, "utf8", size)
        }
        // Raw frames are not surfaced to the UI.
        Message::Frame(_) => return,
    };

    let _ = app.emit(
        EVT_MESSAGE,
        WsMessagePayload {
            session_id: session_id.to_string(),
            direction: "incoming".to_string(),
            opcode: opcode.to_string(),
            data,
            encoding: encoding.to_string(),
            size,
            timestamp: now_ms(),
        },
    );
}

/// Map a tungstenite error to a concise, user-facing message.
fn friendly_error(err: &tokio_tungstenite::tungstenite::Error) -> String {
    use tokio_tungstenite::tungstenite::Error as E;
    match err {
        E::Url(e) => format!("Invalid WebSocket URL: {e}"),
        E::Http(resp) => format!(
            "Handshake rejected with status {}",
            resp.status().as_u16()
        ),
        E::HttpFormat(e) => format!("Invalid handshake: {e}"),
        E::Tls(e) => format!("TLS error: {e}"),
        E::Io(e) => format!("Network error: {e}"),
        E::ConnectionClosed => "Connection closed".to_string(),
        E::AlreadyClosed => "Connection already closed".to_string(),
        other => other.to_string(),
    }
}

#[tauri::command]
pub async fn ws_connect(
    app: AppHandle,
    state: State<'_, WsState>,
    session_id: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    protocols: Option<Vec<String>>,
) -> Result<WsConnectResult, String> {
    // Reject duplicate live sessions with the same id.
    {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| "WebSocket state lock poisoned".to_string())?;
        if sessions.contains_key(&session_id) {
            return Err(format!("WebSocket session already active: {session_id}"));
        }
    }

    let trimmed = url.trim();
    if !(trimmed.starts_with("ws://") || trimmed.starts_with("wss://")) {
        return Err("URL must start with ws:// or wss://".to_string());
    }

    let mut request = trimmed
        .into_client_request()
        .map_err(|e| format!("Invalid WebSocket URL: {e}"))?;

    if let Some(headers) = headers {
        let header_map = request.headers_mut();
        for (key, value) in headers {
            if key.trim().is_empty() {
                continue;
            }
            let name = HeaderName::from_bytes(key.as_bytes())
                .map_err(|e| format!("Invalid header name '{key}': {e}"))?;
            let val = HeaderValue::from_str(&value)
                .map_err(|e| format!("Invalid header value for '{key}': {e}"))?;
            header_map.insert(name, val);
        }
    }

    if let Some(protocols) = protocols {
        let joined = protocols
            .iter()
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join(", ");
        if !joined.is_empty() {
            let val = HeaderValue::from_str(&joined)
                .map_err(|e| format!("Invalid subprotocol list: {e}"))?;
            request
                .headers_mut()
                .insert(HeaderName::from_static("sec-websocket-protocol"), val);
        }
    }

    emit_status(&app, &session_id, "connecting", None, None);

    let (stream, _response) = connect_async(request).await.map_err(|e| {
        let message = friendly_error(&e);
        emit_error(&app, &session_id, message.clone());
        emit_status(&app, &session_id, "closed", None, Some(message.clone()));
        message
    })?;

    let (tx, mut rx) = mpsc::unbounded_channel::<WsCommand>();

    {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "WebSocket state lock poisoned".to_string())?;
        sessions.insert(session_id.clone(), WsSessionHandle { outgoing: tx });
    }

    emit_status(&app, &session_id, "open", None, None);

    let sessions_arc = state.sessions.clone();
    let app_task = app.clone();
    let sid = session_id.clone();

    tokio::spawn(async move {
        let (mut write, mut read) = stream.split();
        let mut close_code: Option<u16> = None;
        let mut close_reason: Option<String> = None;

        loop {
            tokio::select! {
                cmd = rx.recv() => {
                    match cmd {
                        Some(WsCommand::Text(text)) => {
                            if write.send(Message::Text(text.into())).await.is_err() {
                                break;
                            }
                        }
                        Some(WsCommand::Binary(bytes)) => {
                            if write.send(Message::Binary(bytes.into())).await.is_err() {
                                break;
                            }
                        }
                        Some(WsCommand::Close { code, reason }) => {
                            let frame = CloseFrame {
                                code: CloseCode::from(code.unwrap_or(1000)),
                                reason: reason.clone().unwrap_or_default().into(),
                            };
                            let _ = write.send(Message::Close(Some(frame))).await;
                            close_code = code.or(Some(1000));
                            close_reason = reason;
                            break;
                        }
                        // Channel dropped — session removed.
                        None => break,
                    }
                }
                msg = read.next() => {
                    match msg {
                        Some(Ok(message)) => {
                            if let Message::Close(frame) = &message {
                                close_code = frame.as_ref().map(|f| u16::from(f.code));
                                close_reason = frame.as_ref().map(|f| f.reason.to_string());
                            }
                            emit_incoming(&app_task, &sid, &message);
                            if message.is_close() {
                                break;
                            }
                        }
                        Some(Err(err)) => {
                            emit_error(&app_task, &sid, friendly_error(&err));
                            break;
                        }
                        // Stream ended.
                        None => break,
                    }
                }
            }
        }

        let _ = write.close().await;
        if let Ok(mut sessions) = sessions_arc.lock() {
            sessions.remove(&sid);
        }
        emit_status(&app_task, &sid, "closed", close_code, close_reason);
    });

    Ok(WsConnectResult { session_id })
}

#[tauri::command]
pub fn ws_send(
    state: State<'_, WsState>,
    session_id: String,
    kind: String,
    data: String,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "WebSocket state lock poisoned".to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("WebSocket session not connected: {session_id}"))?;

    let command = match kind.as_str() {
        "binary" => {
            let bytes = BASE64
                .decode(data.as_bytes())
                .map_err(|e| format!("Invalid base64 payload: {e}"))?;
            if bytes.len() > MAX_OUTGOING_BYTES {
                return Err("Message exceeds 16 MiB limit".to_string());
            }
            WsCommand::Binary(bytes)
        }
        _ => {
            if data.len() > MAX_OUTGOING_BYTES {
                return Err("Message exceeds 16 MiB limit".to_string());
            }
            WsCommand::Text(data)
        }
    };

    session
        .outgoing
        .send(command)
        .map_err(|_| "WebSocket session is closing".to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ws_close(
    state: State<'_, WsState>,
    session_id: String,
    code: Option<u16>,
    reason: Option<String>,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "WebSocket state lock poisoned".to_string())?;
    // Best-effort: if the session is already gone, treat as success.
    if let Some(session) = sessions.get(&session_id) {
        let _ = session.outgoing.send(WsCommand::Close { code, reason });
    }
    Ok(())
}
