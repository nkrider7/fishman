use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEngineStatus {
    pub ready: bool,
    pub model_loaded: bool,
    pub model_path: Option<String>,
    pub engine_type: String,
    pub ram_usage_mb: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiKeyValue {
    pub id: String,
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGeneratedRequest {
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<AiKeyValue>,
    pub params: Vec<AiKeyValue>,
    pub body_type: String,
    pub body: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiToolCall {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiWorkspaceContext {
    pub active_collection_name: Option<String>,
    pub active_url: Option<String>,
    pub active_method: Option<String>,
    pub environment_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetVariableResult {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCopilotResult {
    pub tool_call: AiToolCall,
    pub generated_request: Option<AiGeneratedRequest>,
    pub generated_schema: Option<String>,
    pub set_variable: Option<SetVariableResult>,
    pub search_query: Option<String>,
    pub raw_output: String,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiScannedEndpoint {
    pub id: String,
    pub name: String,
    pub method: String,
    pub path: String,
    pub description: Option<String>,
    pub folder: Vec<String>,
    pub headers: Vec<AiKeyValue>,
    pub params: Vec<AiKeyValue>,
    pub body_type: String,
    pub body: String,
    pub source_file: String,
    pub line_number: Option<usize>,
    pub framework: String,
    pub requires_auth: bool,
    pub auth_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiScanProgressEvent {
    pub current_file: String,
    pub files_scanned: usize,
    pub total_files: usize,
    pub endpoints_found: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiScanOptions {
    pub base_url: Option<String>,
    pub default_collection_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiScanSummary {
    pub project_path: String,
    pub framework_detected: String,
    pub files_scanned: usize,
    pub endpoints: Vec<AiScannedEndpoint>,
    pub base_url: String,
    pub collection_name: String,
    pub duration_ms: u64,
}

