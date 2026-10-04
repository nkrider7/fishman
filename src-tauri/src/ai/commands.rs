use tauri::State;

use crate::ai::engine::NeedleEngineState;
use crate::ai::tools::{generate_schema_from_json, parse_curl_command};
use crate::ai::types::{AiCopilotResult, AiEngineStatus, AiGeneratedRequest, AiWorkspaceContext};

#[tauri::command]
pub async fn ai_get_status(
    state: State<'_, NeedleEngineState>,
) -> Result<AiEngineStatus, String> {
    Ok(state.get_status().await)
}

#[tauri::command]
pub async fn ai_run_copilot(
    state: State<'_, NeedleEngineState>,
    prompt: String,
    context: Option<AiWorkspaceContext>,
) -> Result<AiCopilotResult, String> {
    state.run_copilot(prompt, context).await
}

#[tauri::command]
pub async fn ai_parse_curl(curl: String) -> Result<AiGeneratedRequest, String> {
    tokio::task::spawn_blocking(move || parse_curl_command(&curl))
        .await
        .map_err(|e| format!("Failed to parse cURL: {}", e))?
}

#[tauri::command]
pub async fn ai_generate_schema(
    sample_json: String,
    format: String,
    root_name: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        generate_schema_from_json(&sample_json, &format, root_name.as_deref())
    })
    .await
    .map_err(|e| format!("Failed to generate schema: {}", e))?
}

#[tauri::command]
pub async fn ai_scan_codebase(
    app: tauri::AppHandle,
    path: String,
    options: Option<crate::ai::types::AiScanOptions>,
) -> Result<crate::ai::types::AiScanSummary, String> {
    crate::ai::scanner::scan_codebase_with_ai(&app, &path, options).await
}

