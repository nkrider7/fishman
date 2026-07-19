use reqwest::header::{HeaderMap, HeaderName, HeaderValue, LOCATION};
use reqwest::multipart::{Form, Part};
use reqwest::redirect::Policy;
use reqwest::{Client, Method, StatusCode, Url};
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

/// One Set-Cookie header, tagged with the response URL that emitted it
/// (needed so default Domain is correct across redirects).
#[derive(Debug, Serialize, Clone)]
pub struct SetCookieCapture {
    pub url: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    /// Set-Cookie values collected across the full redirect chain.
    pub set_cookies: Vec<SetCookieCapture>,
    /// Final URL after redirects (useful for cookie domain defaults).
    pub final_url: Option<String>,
    pub body: String,
    pub size_bytes: usize,
    pub duration_ms: u64,
    pub timing: ResponseTiming,
    pub error: Option<String>,
    /// Echo of the method actually placed on the wire (helps debug extension methods).
    pub request_method: Option<String>,
}

const MAX_REDIRECTS: usize = 20;

fn build_client(ignore_ssl: bool, timeout_ms: u64) -> Result<Client, String> {
    // Manual redirect following so we can capture Set-Cookie on every hop (Bruno-style).
    let mut builder = Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .redirect(Policy::none())
        .no_proxy();

    if ignore_ssl {
        builder = builder.danger_accept_invalid_certs(true);
    }

    builder.build().map_err(|e| e.to_string())
}

fn header_value_to_string(value: &HeaderValue) -> String {
    // Prefer UTF-8; fall back to lossy so cookie octets are never silently dropped.
    match value.to_str() {
        Ok(s) => s.to_string(),
        Err(_) => String::from_utf8_lossy(value.as_bytes()).into_owned(),
    }
}

fn extract_set_cookies(headers: &HeaderMap, response_url: &str) -> Vec<SetCookieCapture> {
    headers
        .get_all("set-cookie")
        .iter()
        .map(|value| SetCookieCapture {
            url: response_url.to_string(),
            value: header_value_to_string(value),
        })
        .collect()
}

fn headers_to_map(headers: &HeaderMap) -> HashMap<String, String> {
    let mut resp_headers = HashMap::new();
    for (key, value) in headers.iter() {
        if key.as_str() == "set-cookie" {
            continue;
        }
        let v = header_value_to_string(value);
        resp_headers
            .entry(key.to_string())
            .and_modify(|existing: &mut String| {
                existing.push_str(", ");
                existing.push_str(&v);
            })
            .or_insert(v);
    }
    resp_headers
}

fn is_redirect(status: StatusCode) -> bool {
    matches!(
        status.as_u16(),
        301 | 302 | 303 | 307 | 308
    )
}

fn resolve_redirect(current: &Url, location: &str) -> Result<Url, String> {
    current
        .join(location)
        .map_err(|e| format!("Invalid redirect Location: {e}"))
}

/// Apply cookies collected earlier in this redirect chain to the next hop.
fn apply_redirect_cookies(headers: &mut HeaderMap, jar: &[(String, String)], next_url: &Url) {
    // jar entries are "name=value" pairs keyed loosely; rebuild Cookie for matching host.
    // Format stored: (cookie_domain_hint_url, "name=value; Path=...")
    let mut pairs: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for (set_url, raw) in jar {
        let Ok(origin) = Url::parse(set_url) else { continue };
        // Host-only match for in-flight jar: same host or parent from Domain= attr.
        let name_value = raw.split(';').next().unwrap_or("").trim();
        if name_value.is_empty() || !name_value.contains('=') {
            continue;
        }
        let name = name_value.split('=').next().unwrap_or("").trim();
        if name.is_empty() || seen.contains(name) {
            continue;
        }

        let mut domain_attr: Option<String> = None;
        let mut secure = false;
        for part in raw.split(';').skip(1) {
            let p = part.trim();
            let lower = p.to_ascii_lowercase();
            if lower == "secure" {
                secure = true;
            } else if let Some(rest) = lower.strip_prefix("domain=") {
                domain_attr = Some(rest.trim().trim_start_matches('.').to_string());
            }
        }

        if secure && next_url.scheme() != "https" {
            continue;
        }

        let host = next_url.host_str().unwrap_or("").to_ascii_lowercase();
        let matches = if let Some(domain) = domain_attr {
            host == domain || host.ends_with(&format!(".{domain}"))
        } else {
            origin.host_str().map(|h| h.eq_ignore_ascii_case(&host)).unwrap_or(false)
        };

        if matches {
            seen.insert(name.to_string());
            pairs.push(name_value.to_string());
        }
    }

    if pairs.is_empty() {
        return;
    }

    // Merge with any existing Cookie header from the client.
    let existing = headers
        .get_all(reqwest::header::COOKIE)
        .iter()
        .map(header_value_to_string)
        .collect::<Vec<_>>()
        .join("; ");
    let merged = if existing.is_empty() {
        pairs.join("; ")
    } else {
        format!("{}; {}", existing, pairs.join("; "))
    };
    headers.remove(reqwest::header::COOKIE);
    if let Ok(val) = HeaderValue::from_str(&merged) {
        headers.insert(reqwest::header::COOKIE, val);
    }
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
        set_cookies: Vec::new(),
        final_url: None,
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
        request_method: None,
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

    let initial_method = match Method::from_bytes(payload.method.to_uppercase().as_bytes()) {
        Ok(m) => m,
        Err(e) => return error_response(start, "Invalid Method", e.to_string()),
    };
    let request_method = initial_method.as_str().to_string();
    eprintln!(
        "[fishman-http] {} {} (body_type={}, body_len={})",
        request_method,
        payload.url,
        payload.body_type,
        payload.body.as_ref().map(|b| b.len()).unwrap_or(0)
    );

    let client = match build_client(payload.ignore_ssl, timeout_ms) {
        Ok(c) => c,
        Err(e) => return error_response(start, "Client Error", e),
    };

    let initial_headers = match build_headers(&payload.headers, is_multipart) {
        Ok(h) => h,
        Err(e) => return error_response(start, "Header Error", e),
    };

    let Ok(mut current_url) = Url::parse(&payload.url) else {
        return error_response(start, "Invalid URL", format!("Invalid URL: {}", payload.url));
    };

    let mut method = initial_method;
    let mut headers = initial_headers;
    let mut body = if is_multipart {
        None
    } else {
        payload.body.clone()
    };
    let mut body_type = payload.body_type.clone();
    let mut collected_cookies: Vec<SetCookieCapture> = Vec::new();
    let mut redirect_jar: Vec<(String, String)> = Vec::new();
    let connect_start = Instant::now();
    let mut ttfb_ms: u64 = 0;

    for hop in 0..=MAX_REDIRECTS {
        if hop > 0 {
            apply_redirect_cookies(&mut headers, &redirect_jar, &current_url);
        }

        let mut request_builder = client.request(method.clone(), current_url.clone()).headers(headers.clone());

        if hop == 0 && is_multipart {
            let parts = payload.form_data.clone().unwrap_or_default();
            match build_multipart_form(&parts) {
                Ok(form) => {
                    request_builder = request_builder.multipart(form);
                }
                Err(e) => return error_response(start, "Form Data Error", e),
            }
        } else if let Some(body_str) = &body {
            if !body_str.is_empty() && body_type != "none" {
                request_builder = match body_type.as_str() {
                    "json" => request_builder
                        .header("Content-Type", "application/json")
                        .body(body_str.clone()),
                    "xml" => request_builder
                        .header("Content-Type", "application/xml")
                        .body(body_str.clone()),
                    "html" => request_builder
                        .header("Content-Type", "text/html")
                        .body(body_str.clone()),
                    "graphql" => request_builder
                        .header("Content-Type", "application/json")
                        .body(body_str.clone()),
                    "raw" | "text" => request_builder.body(body_str.clone()),
                    "x-www-form-urlencoded" => request_builder
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .body(body_str.clone()),
                    _ => request_builder.body(body_str.clone()),
                };
            }
        }

        let response = match request_builder.send().await {
            Ok(r) => r,
            Err(e) => {
                let mut response = error_response(start, "Request Failed", e.to_string());
                response.request_method = Some(request_method);
                response.set_cookies = collected_cookies;
                return response;
            }
        };

        if hop == 0 {
            ttfb_ms = connect_start.elapsed().as_millis() as u64;
        }

        let response_url = response.url().clone();
        let hop_cookies = extract_set_cookies(response.headers(), response_url.as_str());
        for cookie in &hop_cookies {
            redirect_jar.push((cookie.url.clone(), cookie.value.clone()));
        }
        collected_cookies.extend(hop_cookies);

        let status = response.status();
        if is_redirect(status) {
            let Some(location) = response
                .headers()
                .get(LOCATION)
                .map(header_value_to_string)
                .filter(|loc| !loc.is_empty())
            else {
                return break_into_payload(
                    start,
                    ttfb_ms,
                    response,
                    response_url,
                    collected_cookies,
                    request_method,
                )
                .await;
            };

            // Drain body so connection can reuse.
            let _ = response.bytes().await;

            let next_url = match resolve_redirect(&response_url, &location) {
                Ok(u) => u,
                Err(e) => {
                    let mut err = error_response(start, "Redirect Error", e);
                    err.request_method = Some(request_method);
                    err.set_cookies = collected_cookies;
                    return err;
                }
            };

            eprintln!(
                "[fishman-http] redirect {} → {} (cookies so far: {})",
                status.as_u16(),
                next_url,
                collected_cookies.len()
            );

            // RFC 7231: 303 always GET; 301/302 historically become GET for non-GET.
            let status_code = status.as_u16();
            if status_code == 303
                || ((status_code == 301 || status_code == 302)
                    && method != Method::GET
                    && method != Method::HEAD)
            {
                method = Method::GET;
                body = None;
                body_type = "none".into();
                headers.remove(reqwest::header::CONTENT_TYPE);
                headers.remove(reqwest::header::CONTENT_LENGTH);
            }

            current_url = next_url;
            continue;
        }

        // Final (non-redirect) response
        let status_code = status.as_u16();
        let status_text = status.canonical_reason().unwrap_or("Unknown").to_string();
        let resp_headers = headers_to_map(response.headers());
        let final_url = response_url.to_string();

        return match response.text().await {
            Ok(body_text) => {
                let size_bytes = body_text.len();
                let duration_ms = start.elapsed().as_millis() as u64;
                eprintln!(
                    "[fishman-http] final {} {} set_cookies={}",
                    status_code,
                    final_url,
                    collected_cookies.len()
                );
                HttpResponsePayload {
                    status: status_code,
                    status_text,
                    headers: resp_headers,
                    set_cookies: collected_cookies,
                    final_url: Some(final_url),
                    size_bytes,
                    body: body_text,
                    duration_ms,
                    timing: ResponseTiming {
                        total_ms: duration_ms,
                        dns_ms: None,
                        connect_ms: Some(ttfb_ms.saturating_sub(1)),
                        ttfb_ms: Some(ttfb_ms),
                    },
                    error: None,
                    request_method: Some(request_method),
                }
            }
            Err(e) => HttpResponsePayload {
                status: status_code,
                status_text,
                headers: resp_headers,
                set_cookies: collected_cookies,
                final_url: Some(final_url),
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
                request_method: Some(request_method),
            },
        };
    }

    let mut err = error_response(
        start,
        "Too Many Redirects",
        format!("Exceeded {MAX_REDIRECTS} redirects"),
    );
    err.request_method = Some(request_method);
    err.set_cookies = collected_cookies;
    err
}

async fn break_into_payload(
    start: Instant,
    ttfb_ms: u64,
    response: reqwest::Response,
    response_url: Url,
    collected_cookies: Vec<SetCookieCapture>,
    request_method: String,
) -> HttpResponsePayload {
    let status_code = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("Unknown")
        .to_string();
    let resp_headers = headers_to_map(response.headers());
    let final_url = response_url.to_string();
    match response.text().await {
        Ok(body_text) => {
            let size_bytes = body_text.len();
            let duration_ms = start.elapsed().as_millis() as u64;
            HttpResponsePayload {
                status: status_code,
                status_text,
                headers: resp_headers,
                set_cookies: collected_cookies,
                final_url: Some(final_url),
                size_bytes,
                body: body_text,
                duration_ms,
                timing: ResponseTiming {
                    total_ms: duration_ms,
                    dns_ms: None,
                    connect_ms: Some(ttfb_ms.saturating_sub(1)),
                    ttfb_ms: Some(ttfb_ms),
                },
                error: None,
                request_method: Some(request_method),
            }
        }
        Err(e) => HttpResponsePayload {
            status: status_code,
            status_text,
            headers: resp_headers,
            set_cookies: collected_cookies,
            final_url: Some(final_url),
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
            request_method: Some(request_method),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn query_method_reaches_express_style_server() {
        // Raw TCP echo of request-line so we don't depend on an external process.
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 4096];
            let n = socket.read(&mut buf).await.unwrap();
            let raw = String::from_utf8_lossy(&buf[..n]).to_string();
            let body = if raw.starts_with("QUERY ") {
                r#"{"success":true,"method":"QUERY"}"#
            } else {
                r#"{"error":"Method Not Allowed"}"#
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            socket.write_all(response.as_bytes()).await.unwrap();
            raw
        });

        let response = execute_request(HttpRequestPayload {
            method: "QUERY".into(),
            url: format!("http://{addr}/"),
            headers: vec![KeyValue {
                key: "Content-Type".into(),
                value: "application/json".into(),
                enabled: true,
            }],
            body: Some(r#"{"search":"Fishman"}"#.into()),
            body_type: "json".into(),
            form_data: None,
            timeout_ms: Some(5_000),
            ignore_ssl: true,
        })
        .await;

        let raw = server.await.unwrap();
        assert!(
            raw.starts_with("QUERY "),
            "expected QUERY request-line, got:\n{raw}"
        );
        assert!(
            response.body.contains("QUERY"),
            "status={} body={}",
            response.status,
            response.body
        );
    }
}
