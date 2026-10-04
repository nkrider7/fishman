use reqwest::redirect::Policy;
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchTextResult {
    pub content: String,
    pub content_type: Option<String>,
    pub final_url: Option<String>,
    pub status: u16,
}

#[tauri::command]
pub async fn fetch_text_url(
    url: String,
    ignore_ssl: Option<bool>,
    timeout_ms: Option<u64>,
) -> Result<FetchTextResult, String> {
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30_000));
    let ignore = ignore_ssl.unwrap_or(false);

    let mut builder = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(Policy::limited(10));

    if ignore {
        builder = builder.danger_accept_invalid_certs(true);
    }

    let client = builder.build().map_err(|e| e.to_string())?;
    let response = client
        .get(&url)
        .header(
            reqwest::header::ACCEPT,
            "application/json, application/yaml, text/yaml, text/plain, */*",
        )
        .send()
        .await
        .map_err(|e| format!("Failed to fetch OpenAPI URL: {e}"))?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch spec (HTTP {status}) from {final_url}"
        ));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    if content.trim_start().to_ascii_lowercase().starts_with("<!doctype html")
        || content.trim_start().to_ascii_lowercase().starts_with("<html")
    {
        return Err(
            "URL returned HTML (likely Swagger UI). Use the raw .json or .yaml spec URL instead."
                .into(),
        );
    }

    Ok(FetchTextResult {
        content,
        content_type,
        final_url: Some(final_url),
        status,
    })
}
