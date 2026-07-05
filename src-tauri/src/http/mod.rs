use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::multipart::{Form, Part};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize, Clone)]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize, Clone)]
pub struct FormDataPart {
    pub key: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub value: Option<String>,
    pub file_path: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct HttpRequestPayload {
    pub method: String,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub body: Option<String>,
    pub body_type: String,
    pub form_data: Option<Vec<FormDataPart>>,
    pub timeout_ms: Option<u64>,
    pub ignore_ssl: bool,
}

#[derive(Debug, Serialize)]
pub struct ResponseTiming {
    pub total_ms: u64,
    pub dns_ms: Option<u64>,
    pub connect_ms: Option<u64>,
    pub ttfb_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub size_bytes: usize,
    pub duration_ms: u64,
    pub timing: ResponseTiming,
    pub error: Option<String>,
}

fn build_client(ignore_ssl: bool, timeout_ms: u64) -> Result<Client, String> {
    let mut builder = Client::builder().timeout(Duration::from_millis(timeout_ms));

    if ignore_ssl {
        builder = builder.danger_accept_invalid_certs(true);
    }

    builder.build().map_err(|e| e.to_string())
}

fn build_headers(headers: &[KeyValue], strip_content_type: bool) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for h in headers.iter().filter(|h| h.enabled && !h.key.is_empty()) {
        if strip_content_type && h.key.eq_ignore_ascii_case("content-type") {
            continue;
        }
        let name = HeaderName::from_str(&h.key).map_err(|e| e.to_string())?;
        let value = HeaderValue::from_str(&h.value).map_err(|e| e.to_string())?;
        map.insert(name, value);
    }
    Ok(map)
}

fn error_response(start: Instant, status_text: &str, error: String) -> HttpResponsePayload {
    HttpResponsePayload {
        status: 0,
        status_text: status_text.into(),
        headers: HashMap::new(),
        body: String::new(),
        size_bytes: 0,
        duration_ms: start.elapsed().as_millis() as u64,
        timing: ResponseTiming {
            total_ms: start.elapsed().as_millis() as u64,
            dns_ms: None,
            connect_ms: None,
            ttfb_ms: None,
        },
        error: Some(error),
    }
}

fn build_multipart_form(parts: &[FormDataPart]) -> Result<Form, String> {
    let enabled: Vec<&FormDataPart> = parts
        .iter()
        .filter(|p| p.enabled && !p.key.trim().is_empty())
        .collect();

    if enabled.is_empty() {
        return Err("No enabled form fields to send".into());
    }

    let mut form = Form::new();

    for part in enabled {
        match part.field_type.as_str() {
            "file" => {
                let path = part
                    .file_path
                    .as_ref()
                    .filter(|p| !p.trim().is_empty())
                    .ok_or_else(|| {
                        format!("Form field \"{}\" is missing a file path", part.key)
                    })?;

                let file_path = Path::new(path);
                if !file_path.exists() {
                    return Err(format!("File not found: {path}"));
                }

                let bytes = std::fs::read(file_path)
                    .map_err(|e| format!("Failed to read file {path}: {e}"))?;

                let file_name = file_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("file")
                    .to_string();

                let mime = mime_guess::from_path(file_path)
                    .first_or_octet_stream()
                    .to_string();

                let file_part = Part::bytes(bytes)
                    .file_name(file_name)
                    .mime_str(&mime)
                    .map_err(|e| e.to_string())?;

                form = form.part(part.key.clone(), file_part);
            }
            _ => {
                let value = part.value.clone().unwrap_or_default();
                form = form.text(part.key.clone(), value);
            }
        }
    }

    Ok(form)
}

#[tauri::command]
pub async fn execute_request(payload: HttpRequestPayload) -> HttpResponsePayload {
    let start = Instant::now();
    let timeout_ms = payload.timeout_ms.unwrap_or(30_000);
    let is_multipart = payload.body_type == "form-data";

    let method = match Method::from_bytes(payload.method.to_uppercase().as_bytes()) {
        Ok(m) => m,
        Err(e) => return error_response(start, "Invalid Method", e.to_string()),
    };

    let client = match build_client(payload.ignore_ssl, timeout_ms) {
        Ok(c) => c,
        Err(e) => return error_response(start, "Client Error", e),
    };

    let headers = match build_headers(&payload.headers, is_multipart) {
        Ok(h) => h,
        Err(e) => return error_response(start, "Header Error", e),
    };

    let url = payload.url.clone();
    let mut request_builder = client.request(method, &url).headers(headers);

    if is_multipart {
        let parts = payload.form_data.unwrap_or_default();
        match build_multipart_form(&parts) {
            Ok(form) => {
                request_builder = request_builder.multipart(form);
            }
            Err(e) => return error_response(start, "Form Data Error", e),
        }
    } else if let Some(body) = &payload.body {
        if !body.is_empty() && payload.body_type != "none" {
            request_builder = match payload.body_type.as_str() {
                "json" => request_builder
                    .header("Content-Type", "application/json")
                    .body(body.clone()),
                "xml" => request_builder
                    .header("Content-Type", "application/xml")
                    .body(body.clone()),
                "html" => request_builder
                    .header("Content-Type", "text/html")
                    .body(body.clone()),
                "graphql" => request_builder
                    .header("Content-Type", "application/json")
                    .body(body.clone()),
                "raw" | "text" => request_builder.body(body.clone()),
                "x-www-form-urlencoded" => request_builder
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .body(body.clone()),
                _ => request_builder.body(body.clone()),
            };
        }
    }

    let connect_start = Instant::now();
    match request_builder.send().await {
        Ok(response) => {
            let ttfb_ms = connect_start.elapsed().as_millis() as u64;
            let status = response.status().as_u16();
            let status_text = response
                .status()
                .canonical_reason()
                .unwrap_or("Unknown")
                .to_string();

            let mut resp_headers = HashMap::new();
            for (key, value) in response.headers().iter() {
                if let Ok(v) = value.to_str() {
                    resp_headers.insert(key.to_string(), v.to_string());
                }
            }

            match response.text().await {
                Ok(body) => {
                    let size_bytes = body.len();
                    let duration_ms = start.elapsed().as_millis() as u64;
                    HttpResponsePayload {
                        status,
                        status_text,
                        headers: resp_headers,
                        size_bytes,
                        body,
                        duration_ms,
                        timing: ResponseTiming {
                            total_ms: duration_ms,
                            dns_ms: None,
                            connect_ms: Some(ttfb_ms.saturating_sub(1)),
                            ttfb_ms: Some(ttfb_ms),
                        },
                        error: None,
                    }
                }
                Err(e) => HttpResponsePayload {
                    status,
                    status_text,
                    headers: resp_headers,
                    body: String::new(),
                    size_bytes: 0,
                    duration_ms: start.elapsed().as_millis() as u64,
                    timing: ResponseTiming {
                        total_ms: start.elapsed().as_millis() as u64,
                        dns_ms: None,
                        connect_ms: None,
                        ttfb_ms: None,
                    },
                    error: Some(e.to_string()),
                },
            }
        }
        Err(e) => error_response(start, "Request Failed", e.to_string()),
    }
}
