use crate::ai::types::{AiGeneratedRequest, AiKeyValue, AiToolCall, SetVariableResult};
use serde_json::{json, Value};

/// Returns the 5 tool schemas formatted as JSON for Needle 2 tool router.
#[allow(dead_code)]
pub fn get_needle_tool_definitions() -> Value {
    json!([
        {
            "name": "generate_http_request",
            "description": "Generate a complete HTTP request including method, URL, headers, and request body based on user intent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Descriptive short name for the request (e.g. 'Register User', 'Get Profile')"
                    },
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
                        "description": "HTTP method to use"
                    },
                    "url": {
                        "type": "string",
                        "description": "Target endpoint URL, using variables where appropriate like {{base_url}}/api/..."
                    },
                    "headers": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "key": { "type": "string" },
                                "value": { "type": "string" }
                            },
                            "required": ["key", "value"]
                        },
                        "description": "HTTP headers"
                    },
                    "params": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "key": { "type": "string" },
                                "value": { "type": "string" }
                            },
                            "required": ["key", "value"]
                        },
                        "description": "URL query parameters"
                    },
                    "body_type": {
                        "type": "string",
                        "enum": ["json", "form-data", "x-www-form-urlencoded", "raw", "none"],
                        "description": "Request body content type"
                    },
                    "body": {
                        "type": "string",
                        "description": "Stringified request payload (e.g. JSON string formatted with 2 spaces)"
                    },
                    "description": {
                        "type": "string",
                        "description": "Brief explanation of what this request does"
                    }
                },
                "required": ["method", "url"]
            }
        },
        {
            "name": "curl_to_request",
            "description": "Convert a raw cURL command string into a structured Fishman HTTP request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "curl_command": {
                        "type": "string",
                        "description": "The full curl command string"
                    }
                },
                "required": ["curl_command"]
            }
        },
        {
            "name": "extract_json_schema",
            "description": "Extract a TypeScript interface or JSON Schema from a sample JSON response.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sample_json": {
                        "type": "string",
                        "description": "Sample JSON string to generate types for"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["typescript", "json_schema"],
                        "description": "Desired output format: 'typescript' interface or 'json_schema'"
                    },
                    "root_name": {
                        "type": "string",
                        "description": "Root interface/schema name (e.g. 'ApiResponse' or 'UserPayload')"
                    }
                },
                "required": ["sample_json"]
            }
        },
        {
            "name": "set_environment_variable",
            "description": "Extract or save a value into a Fishman environment variable (e.g. {{AUTH_TOKEN}}).",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "Variable key name without double curly braces (e.g. 'AUTH_TOKEN' or 'user_id')"
                    },
                    "value": {
                        "type": "string",
                        "description": "Literal value to store or variable selector"
                    }
                },
                "required": ["key", "value"]
            }
        },
        {
            "name": "search_workspace",
            "description": "Search saved requests, collections, and environments in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query or semantic intent (e.g. 'login', 'billing endpoints')"
                    }
                },
                "required": ["query"]
            }
        }
    ])
}

/// Robust parser converting a cURL command into an `AiGeneratedRequest`.
pub fn parse_curl_command(curl: &str) -> Result<AiGeneratedRequest, String> {
    let raw = curl.trim();
    if !raw.to_lowercase().starts_with("curl") {
        return Err("Command does not begin with 'curl'".to_string());
    }

    // Tokenize respecting quotes
    let tokens = tokenize_command(raw);
    if tokens.is_empty() {
        return Err("Empty curl command".to_string());
    }

    let mut method = "GET".to_string();
    let mut url = String::new();
    let mut headers = Vec::new();
    let mut body = String::new();
    let mut method_explicit = false;

    let mut i = 1;
    while i < tokens.len() {
        let token = &tokens[i];

        if token == "-X" || token == "--request" {
            if i + 1 < tokens.len() {
                method = tokens[i + 1].to_uppercase();
                method_explicit = true;
                i += 2;
                continue;
            }
        } else if token == "-H" || token == "--header" {
            if i + 1 < tokens.len() {
                let header_str = &tokens[i + 1];
                if let Some((k, v)) = header_str.split_once(':') {
                    headers.push(AiKeyValue {
                        id: format!("h_{}", headers.len()),
                        key: k.trim().to_string(),
                        value: v.trim().to_string(),
                        enabled: true,
                    });
                }
                i += 2;
                continue;
            }
        } else if token == "-d"
            || token == "--data"
            || token == "--data-raw"
            || token == "--data-binary"
            || token == "--data-ascii"
        {
            if i + 1 < tokens.len() {
                body = tokens[i + 1].clone();
                if !method_explicit {
                    method = "POST".to_string();
                }
                i += 2;
                continue;
            }
        } else if token == "-u" || token == "--user" {
            if i + 1 < tokens.len() {
                let creds = &tokens[i + 1];
                let encoded = base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    creds.as_bytes(),
                );
                headers.push(AiKeyValue {
                    id: format!("h_{}", headers.len()),
                    key: "Authorization".to_string(),
                    value: format!("Basic {}", encoded),
                    enabled: true,
                });
                i += 2;
                continue;
            }
        } else if token == "--url" {
            if i + 1 < tokens.len() {
                url = tokens[i + 1].clone();
                i += 2;
                continue;
            }
        } else if !token.starts_with('-') && url.is_empty() {
            url = token.clone();
            i += 1;
            continue;
        }

        i += 1;
    }

    if url.is_empty() {
        url = "https://api.example.com".to_string();
    }

    // Parse query params out of URL
    let mut params = Vec::new();
    let clean_url = if let Some((base, query_str)) = url.split_once('?') {
        for pair in query_str.split('&') {
            if !pair.is_empty() {
                let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
                params.push(AiKeyValue {
                    id: format!("p_{}", params.len()),
                    key: urlencoding::decode(k).unwrap_or(std::borrow::Cow::Borrowed(k)).into_owned(),
                    value: urlencoding::decode(v).unwrap_or(std::borrow::Cow::Borrowed(v)).into_owned(),
                    enabled: true,
                });
            }
        }
        base.to_string()
    } else {
        url
    };

    let body_type = if body.trim().is_empty() {
        "none".to_string()
    } else if serde_json::from_str::<Value>(&body).is_ok() {
        "json".to_string()
    } else {
        "raw".to_string()
    };

    // If json body and no Content-Type header present, add it
    if body_type == "json" && !headers.iter().any(|h| h.key.eq_ignore_ascii_case("content-type")) {
        headers.push(AiKeyValue {
            id: format!("h_{}", headers.len()),
            key: "Content-Type".to_string(),
            value: "application/json".to_string(),
            enabled: true,
        });
    }

    let name = format!("cURL {} {}", method, clean_url);

    Ok(AiGeneratedRequest {
        name,
        method,
        url: clean_url,
        headers,
        params,
        body_type,
        body,
        description: Some("Imported from cURL command".to_string()),
    })
}

/// Tokenizes a command line string respecting single and double quotes and escaped chars.
fn tokenize_command(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut escaped = false;

    for ch in input.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        if ch == '\\' && !in_single_quote {
            escaped = true;
            continue;
        }

        if ch == '\'' && !in_double_quote {
            in_single_quote = !in_single_quote;
            continue;
        }

        if ch == '"' && !in_single_quote {
            in_double_quote = !in_double_quote;
            continue;
        }

        if ch.is_whitespace() && !in_single_quote && !in_double_quote {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
            continue;
        }

        current.push(ch);
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

/// Generates TypeScript interface or JSON Schema from a sample JSON string.
pub fn generate_schema_from_json(
    sample_json: &str,
    format: &str,
    root_name: Option<&str>,
) -> Result<String, String> {
    let parsed: Value = serde_json::from_str(sample_json)
        .map_err(|e| format!("Invalid JSON provided: {}", e))?;

    let name = root_name.unwrap_or("ApiResponse");

    if format.eq_ignore_ascii_case("json_schema") {
        let schema = value_to_json_schema(&parsed);
        serde_json::to_string_pretty(&schema)
            .map_err(|e| format!("Failed to format JSON Schema: {}", e))
    } else {
        // TypeScript definition
        let mut out = String::new();
        json_to_typescript_interface(&parsed, name, &mut out);
        Ok(out)
    }
}

fn value_to_json_schema(val: &Value) -> Value {
    match val {
        Value::Null => json!({ "type": "null" }),
        Value::Bool(_) => json!({ "type": "boolean" }),
        Value::Number(n) => {
            if n.is_i64() || n.is_u64() {
                json!({ "type": "integer" })
            } else {
                json!({ "type": "number" })
            }
        }
        Value::String(_) => json!({ "type": "string" }),
        Value::Array(arr) => {
            let item_schema = if let Some(first) = arr.first() {
                value_to_json_schema(first)
            } else {
                json!({})
            };
            json!({
                "type": "array",
                "items": item_schema
            })
        }
        Value::Object(map) => {
            let mut props = serde_json::Map::new();
            let mut required = Vec::new();
            for (k, v) in map {
                props.insert(k.clone(), value_to_json_schema(v));
                required.push(k.clone());
            }
            json!({
                "type": "object",
                "properties": props,
                "required": required
            })
        }
    }
}

fn json_to_typescript_interface(val: &Value, name: &str, out: &mut String) {
    match val {
        Value::Object(map) => {
            out.push_str(&format!("export interface {} {{\n", name));
            let mut nested = Vec::new();

            for (k, v) in map {
                let sanitized_key = sanitize_ts_identifier(k);
                match v {
                    Value::Null => out.push_str(&format!("  {}: null;\n", sanitized_key)),
                    Value::Bool(_) => out.push_str(&format!("  {}: boolean;\n", sanitized_key)),
                    Value::Number(_) => out.push_str(&format!("  {}: number;\n", sanitized_key)),
                    Value::String(_) => out.push_str(&format!("  {}: string;\n", sanitized_key)),
                    Value::Array(arr) => {
                        if let Some(first) = arr.first() {
                            if first.is_object() {
                                let child_name = format!("{}_{}", name, capitalize(k));
                                out.push_str(&format!("  {}: {}[];\n", sanitized_key, child_name));
                                nested.push((child_name, first));
                            } else {
                                let item_type = match first {
                                    Value::Bool(_) => "boolean",
                                    Value::Number(_) => "number",
                                    Value::String(_) => "string",
                                    _ => "any",
                                };
                                out.push_str(&format!("  {}: {}[];\n", sanitized_key, item_type));
                            }
                        } else {
                            out.push_str(&format!("  {}: any[];\n", sanitized_key));
                        }
                    }
                    Value::Object(_) => {
                        let child_name = format!("{}_{}", name, capitalize(k));
                        out.push_str(&format!("  {}: {};\n", sanitized_key, child_name));
                        nested.push((child_name, v));
                    }
                }
            }
            out.push_str("}\n\n");

            for (child_name, child_val) in nested {
                json_to_typescript_interface(child_val, &child_name, out);
            }
        }
        Value::Array(arr) => {
            if let Some(first) = arr.first() {
                let child_name = format!("{}Item", name);
                json_to_typescript_interface(first, &child_name, out);
                out.push_str(&format!("export type {} = {}[];\n", name, child_name));
            } else {
                out.push_str(&format!("export type {} = any[];\n", name));
            }
        }
        _ => {
            out.push_str(&format!("export type {} = any;\n", name));
        }
    }
}

fn sanitize_ts_identifier(key: &str) -> String {
    if key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        key.to_string()
    } else {
        format!("\"{}\"", key)
    }
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().chain(chars).collect(),
    }
}

/// Fallback pattern router for the 5 tools when offline model is warming up or during local dev.
pub fn execute_rule_router(prompt: &str) -> (AiToolCall, Option<AiGeneratedRequest>, Option<String>, Option<SetVariableResult>, Option<String>) {
    let p = prompt.trim();
    let lower = p.to_lowercase();

    // 1. Check if it's a cURL command
    if lower.starts_with("curl ") || lower.starts_with("curl\n") || (lower.contains("curl -") && lower.contains("http")) {
        let curl_str = if let Some(idx) = lower.find("curl ") {
            &p[idx..]
        } else {
            p
        };
        let parsed = parse_curl_command(curl_str).ok();
        let tool = AiToolCall {
            name: "curl_to_request".to_string(),
            arguments: json!({ "curl_command": curl_str }),
        };
        return (tool, parsed, None, None, None);
    }

    // 2. Check if asking for Schema / Typescript
    if lower.contains("schema") || lower.contains("typescript") || lower.contains("interface") || lower.contains("typedef") {
        // extract json body if present
        let sample = extract_json_from_text(p).unwrap_or_else(|| "{\n  \"id\": 1,\n  \"name\": \"Sample Item\",\n  \"active\": true\n}".to_string());
        let fmt = if lower.contains("json schema") { "json_schema" } else { "typescript" };
        let schema = generate_schema_from_json(&sample, fmt, Some("ExtractedPayload")).ok();
        let tool = AiToolCall {
            name: "extract_json_schema".to_string(),
            arguments: json!({ "sample_json": sample, "format": fmt }),
        };
        return (tool, None, schema, None, None);
    }

    // 3. Check if setting environment variable
    if lower.contains("set variable") || lower.contains("save variable") || lower.contains("store variable") || (lower.contains("token") && (lower.contains("save") || lower.contains("set"))) {
        let key = extract_variable_key(&lower).unwrap_or_else(|| "AUTH_TOKEN".to_string());
        let val = extract_variable_value(p).unwrap_or_else(|| "{{response.body.token}}".to_string());
        let tool = AiToolCall {
            name: "set_environment_variable".to_string(),
            arguments: json!({ "key": key, "value": val }),
        };
        return (tool, None, None, Some(SetVariableResult { key, value: val }), None);
    }

    // 4. Check if searching workspace
    if lower.starts_with("search ") || lower.starts_with("find ") || lower.starts_with("locate ") || lower.contains("search workspace") {
        let query = lower.trim_start_matches("search ").trim_start_matches("find ").trim_start_matches("locate ").trim().to_string();
        let tool = AiToolCall {
            name: "search_workspace".to_string(),
            arguments: json!({ "query": query }),
        };
        return (tool, None, None, None, Some(query));
    }

    // 5. Default: Generate HTTP Request
    let generated = synthesize_http_request(p);
    let tool = AiToolCall {
        name: "generate_http_request".to_string(),
        arguments: json!({
            "method": generated.method,
            "url": generated.url,
            "body": generated.body,
            "body_type": generated.body_type
        }),
    };
    (tool, Some(generated), None, None, None)
}

fn extract_json_from_text(text: &str) -> Option<String> {
    let start = text.find('{').or_else(|| text.find('['))?;
    let end = text.rfind('}').or_else(|| text.rfind(']'))?;
    if end > start {
        let slice = &text[start..=end];
        if serde_json::from_str::<Value>(slice).is_ok() {
            return Some(slice.to_string());
        }
    }
    None
}

fn extract_variable_key(lower: &str) -> Option<String> {
    for word in lower.split_whitespace() {
        if word.starts_with("{{") && word.ends_with("}}") {
            return Some(word.trim_matches('{').trim_matches('}').to_string());
        }
        if word.starts_with('$') {
            return Some(word.trim_start_matches('$').to_string());
        }
    }
    if lower.contains("token") {
        return Some("AUTH_TOKEN".to_string());
    }
    if lower.contains("user_id") || lower.contains("userid") {
        return Some("USER_ID".to_string());
    }
    None
}

fn extract_variable_value(text: &str) -> Option<String> {
    if let Some((_, val)) = text.split_once(" to ") {
        return Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
    }
    if let Some((_, val)) = text.split_once(" as ") {
        return Some(val.trim().trim_matches('"').trim_matches('\'').to_string());
    }
    None
}

fn synthesize_http_request(prompt: &str) -> AiGeneratedRequest {
    let lower = prompt.to_lowercase();

    let method = if lower.contains("delete") || lower.contains("remove") {
        "DELETE"
    } else if lower.contains("put ") || lower.contains("replace") {
        "PUT"
    } else if lower.contains("patch ") || lower.contains("partially update") {
        "PATCH"
    } else if lower.contains("post ") || lower.contains("create") || lower.contains("register") || lower.contains("login") || lower.contains("add ") {
        "POST"
    } else {
        "GET"
    };

    let mut path = "/api/v1/resource".to_string();
    let mut name = "Generated Request".to_string();
    let mut body = String::new();
    let mut body_type = "none".to_string();

    if lower.contains("register") || lower.contains("signup") {
        path = "/api/v1/auth/register".to_string();
        name = "Register User".to_string();
        body = json!({
            "email": "user@example.com",
            "password": "SecurePassword123!",
            "name": "Jane Doe"
        }).to_string();
        body_type = "json".to_string();
    } else if lower.contains("login") || lower.contains("sign in") || lower.contains("authenticate") {
        path = "/api/v1/auth/login".to_string();
        name = "User Login".to_string();
        body = json!({
            "email": "user@example.com",
            "password": "SecurePassword123!"
        }).to_string();
        body_type = "json".to_string();
    } else if lower.contains("user") || lower.contains("profile") {
        path = "/api/v1/users".to_string();
        name = format!("{} User", method);
        if method == "POST" || method == "PUT" || method == "PATCH" {
            body = json!({
                "username": "janedoe",
                "email": "jane@example.com"
            }).to_string();
            body_type = "json".to_string();
        }
    } else if lower.contains("product") || lower.contains("item") {
        path = "/api/v1/products".to_string();
        name = format!("{} Product", method);
    }

    let url = format!("{{{{base_url}}}}{}", path);

    let mut headers = Vec::new();
    if body_type == "json" {
        headers.push(AiKeyValue {
            id: "h_0".to_string(),
            key: "Content-Type".to_string(),
            value: "application/json".to_string(),
            enabled: true,
        });
    }

    AiGeneratedRequest {
        name,
        method: method.to_string(),
        url,
        headers,
        params: Vec::new(),
        body_type,
        body,
        description: Some(format!("Generated from prompt: {}", prompt)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_curl_simple() {
        let curl = "curl -X POST https://api.example.com/items -H 'Content-Type: application/json' -d '{\"title\":\"Test\"}'";
        let res = parse_curl_command(curl).unwrap();
        assert_eq!(res.method, "POST");
        assert_eq!(res.url, "https://api.example.com/items");
        assert_eq!(res.body_type, "json");
        assert_eq!(res.headers.len(), 1);
        assert_eq!(res.headers[0].key, "Content-Type");
    }

    #[test]
    fn test_parse_curl_params() {
        let curl = "curl 'https://api.example.com/search?q=rust&limit=10'";
        let res = parse_curl_command(curl).unwrap();
        assert_eq!(res.method, "GET");
        assert_eq!(res.url, "https://api.example.com/search");
        assert_eq!(res.params.len(), 2);
        assert_eq!(res.params[0].key, "q");
        assert_eq!(res.params[0].value, "rust");
    }

    #[test]
    fn test_generate_typescript_schema() {
        let sample = r#"{"id": 1, "name": "John", "roles": ["admin"]}"#;
        let ts = generate_schema_from_json(sample, "typescript", Some("User")).unwrap();
        assert!(ts.contains("export interface User"));
        assert!(ts.contains("id: number;"));
        assert!(ts.contains("name: string;"));
        assert!(ts.contains("roles: string[];"));
    }
}
