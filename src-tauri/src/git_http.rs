//! Binary-capable HTTP for isomorphic-git (fetch/push/pull).
//! Browser `fetch` fails in Tauri WebKit with opaque "Load failed" / CORS;
//! this command uses reqwest with no CORS restrictions.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;

#[derive(Debug, Deserialize)]
pub struct GitHttpRequestPayload {
    pub url: String,
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    /// Optional request body as standard base64.
    pub body_base64: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct GitHttpResponsePayload {
    pub url: String,
    pub method: String,
    pub status_code: u16,
    pub status_message: String,
    pub headers: HashMap<String, String>,
    pub body_base64: String,
}

fn build_client(timeout_ms: u64) -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent("Fishman/0.1 (isomorphic-git; Tauri)")
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_http_request(
    payload: GitHttpRequestPayload,
) -> Result<GitHttpResponsePayload, String> {
    let method_str = payload
        .method
        .as_deref()
        .unwrap_or("GET")
        .trim()
        .to_uppercase();
    let method = Method::from_str(&method_str).unwrap_or(Method::GET);
    let timeout_ms = payload.timeout_ms.unwrap_or(120_000);
    let client = build_client(timeout_ms)?;

    let mut headers = HeaderMap::new();
    if let Some(map) = &payload.headers {
        for (k, v) in map {
            let name = HeaderName::from_str(k).map_err(|e| e.to_string())?;
            let value = HeaderValue::from_str(v).map_err(|e| e.to_string())?;
            headers.insert(name, value);
        }
    }

    let mut builder = client.request(method.clone(), &payload.url).headers(headers);

    if let Some(b64) = &payload.body_base64 {
        if !b64.is_empty() {
            let bytes = B64.decode(b64).map_err(|e| format!("Invalid body base64: {e}"))?;
            builder = builder.body(bytes);
        }
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("Git HTTP request failed: {e}"))?;

    let status = response.status();
    let status_code = status.as_u16();
    let status_message = status
        .canonical_reason()
        .unwrap_or("")
        .to_string();
    let final_url = response.url().to_string();

    let mut out_headers = HashMap::new();
    for (name, value) in response.headers().iter() {
        if let Ok(v) = value.to_str() {
            // isomorphic-git expects lowercase header names in some paths
            out_headers.insert(name.as_str().to_ascii_lowercase(), v.to_string());
        }
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Git HTTP body read failed: {e}"))?;

    Ok(GitHttpResponsePayload {
        url: final_url,
        method: method_str,
        status_code,
        status_message,
        headers: out_headers,
        body_base64: B64.encode(&bytes),
    })
}
