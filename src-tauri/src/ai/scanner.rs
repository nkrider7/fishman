use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use crate::ai::types::{
    AiKeyValue, AiScanOptions, AiScanProgressEvent, AiScanSummary, AiScannedEndpoint,
};

/// Tracks discovered router mounts, variable bindings, and API prefixes across the project.
#[derive(Debug, Clone, Default)]
pub struct ProjectMountMap {
    /// Maps normalized relative file path (e.g. "src/routes/cycle.route.js") -> mount prefix (e.g. "/api/cycle")
    pub file_to_mount: HashMap<String, String>,
    /// Maps router variable / identifier name -> mount prefix (e.g. "cycleRouter" -> "/api/cycle")
    pub var_to_mount: HashMap<String, String>,
    /// Maps file stem (e.g. "cycle.route", "cycle") -> mount prefix
    pub stem_to_mount: HashMap<String, String>,
    /// Detected global API prefix if any (e.g. "/api/v1" or "/api")
    pub detected_api_prefix: Option<String>,
}

impl ProjectMountMap {
    /// Resolves the mount prefix for a given file path.
    pub fn resolve_mount_prefix(&self, relative_path: &str) -> String {
        let norm_path = relative_path.replace('\\', "/");

        // 1. Direct file match
        if let Some(m) = self.file_to_mount.get(&norm_path) {
            return m.clone();
        }

        // 2. Stem match
        let path = Path::new(&norm_path);
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            if let Some(m) = self.stem_to_mount.get(stem) {
                return m.clone();
            }

            let clean = clean_stem(stem);
            if let Some(m) = self.stem_to_mount.get(&clean) {
                return m.clone();
            }

            // Also check var_to_mount for clean + "Router", clean + "Routes", clean + "_router"
            let candidate_vars = [
                format!("{}Router", clean),
                format!("{}Routes", clean),
                format!("{}_router", clean),
                format!("{}_routes", clean),
            ];
            for var in candidate_vars {
                if let Some(m) = self.var_to_mount.get(&var) {
                    return m.clone();
                }
            }

            // 3. Fallback Heuristic from Entity Name:
            // If this file is a route or controller file (e.g. src/routes/cycle.route.js or src/controllers/auth.controller.ts)
            // and clean is a meaningful entity (not "index", "app", "server", "main")
            if !clean.is_empty()
                && clean != "index"
                && clean != "app"
                && clean != "server"
                && clean != "main"
                && clean != "routes"
                && clean != "router"
                && (norm_path.contains("route")
                    || norm_path.contains("controller")
                    || norm_path.contains("api"))
            {
                let api_base = self.detected_api_prefix.as_deref().unwrap_or("/api");
                return format!("{}/{}", api_base.trim_end_matches('/'), clean);
            }
        }

        String::new()
    }
}

/// High-speed offline codebase scanner that discovers backend endpoints and enriches them
/// using the native Needle 2 engine.
pub async fn scan_codebase_with_ai(
    app: &AppHandle,
    root_path_str: &str,
    options: Option<AiScanOptions>,
) -> Result<AiScanSummary, String> {
    let start_time = Instant::now();
    let root_path = PathBuf::from(root_path_str);

    if !root_path.exists() || !root_path.is_dir() {
        return Err(format!(
            "Target path does not exist or is not a directory: {}",
            root_path_str
        ));
    }

    let default_collection_name = options
        .as_ref()
        .and_then(|o| o.default_collection_name.clone())
        .unwrap_or_else(|| {
            root_path
                .file_name()
                .map(|n| format!("{} API", n.to_string_lossy()))
                .unwrap_or_else(|| "Scanned API".to_string())
        });

    let base_url = options
        .as_ref()
        .and_then(|o| o.base_url.clone())
        .unwrap_or_else(|| "http://localhost:3000".to_string());

    // 1. Gather all candidate backend files
    let mut candidate_files = Vec::new();
    collect_candidate_files(&root_path, &mut candidate_files);

    // 2. Pre-scan: Build project mount map across all files
    let mount_map = build_project_mount_map(&candidate_files, &root_path);

    let total_files = candidate_files.len();
    let mut files_scanned = 0;
    let mut discovered_endpoints = Vec::new();
    let mut framework_detected = "Generic Backend".to_string();

    // 3. Scan and extract route blocks with resolved mount prefixes
    for file_path in candidate_files {
        files_scanned += 1;

        let relative_path = file_path
            .strip_prefix(&root_path)
            .unwrap_or(&file_path)
            .to_string_lossy()
            .to_string();

        let _ = app.emit(
            "ai-scan-progress",
            AiScanProgressEvent {
                current_file: relative_path.clone(),
                files_scanned,
                total_files,
                endpoints_found: discovered_endpoints.len(),
            },
        );

        if let Ok(content) = fs::read_to_string(&file_path) {
            let mount_prefix = mount_map.resolve_mount_prefix(&relative_path);
            let pfx_opt = if mount_prefix.is_empty() {
                None
            } else {
                Some(mount_prefix.as_str())
            };

            let (file_endpoints, detected_fw) =
                harvest_endpoints_from_file_with_prefix(&relative_path, &content, pfx_opt);

            if framework_detected == "Generic Backend" && !detected_fw.is_empty() {
                framework_detected = detected_fw;
            }

            discovered_endpoints.extend(file_endpoints);
        }
    }

    // Deduplicate endpoints by method + path
    let mut seen_keys = HashSet::new();
    let mut unique_endpoints = Vec::new();
    for ep in discovered_endpoints {
        let key = format!("{}:{}", ep.method, ep.path);
        if seen_keys.insert(key) {
            unique_endpoints.push(ep);
        }
    }

    let duration_ms = start_time.elapsed().as_millis() as u64;

    Ok(AiScanSummary {
        project_path: root_path_str.to_string(),
        framework_detected,
        files_scanned,
        endpoints: unique_endpoints,
        base_url,
        collection_name: default_collection_name,
        duration_ms,
    })
}

fn collect_candidate_files(dir: &Path, result: &mut Vec<PathBuf>) {
    let skip_dirs = [
        ".git",
        "node_modules",
        "target",
        "dist",
        "build",
        ".next",
        "venv",
        ".venv",
        "__pycache__",
        ".idea",
        ".vscode",
        "vendor",
        "coverage",
        ".turbo",
    ];

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if !skip_dirs.contains(&name) && !name.starts_with('.') {
                        collect_candidate_files(&path, result);
                    }
                }
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if matches!(
                        ext_lower.as_str(),
                        "ts" | "js" | "mjs" | "py" | "go" | "java" | "kt" | "rs"
                    ) {
                        result.push(path);
                    }
                }
            }
        }
    }
}

/// Builds the project mount map by parsing imports, app.use, include_router, @Controller, etc.
pub fn build_project_mount_map(files: &[PathBuf], root_path: &Path) -> ProjectMountMap {
    let mut mount_map = ProjectMountMap::default();
    let mut var_to_stem: HashMap<String, String> = HashMap::new();

    for file_path in files {
        let relative_path = file_path
            .strip_prefix(root_path)
            .unwrap_or(file_path)
            .to_string_lossy()
            .to_string();

        if let Ok(content) = fs::read_to_string(file_path) {
            parse_mounts_from_content(&relative_path, &content, &mut mount_map, &mut var_to_stem);
        }
    }

    // Resolve any var_to_mount mapped to stem_to_mount
    for (var, stem) in &var_to_stem {
        if let Some(mount) = mount_map.var_to_mount.get(var) {
            mount_map.stem_to_mount.insert(stem.clone(), mount.clone());
            let clean = clean_stem(stem);
            mount_map.stem_to_mount.insert(clean, mount.clone());
        }
    }

    mount_map
}

fn parse_mounts_from_content(
    relative_path: &str,
    content: &str,
    mount_map: &mut ProjectMountMap,
    var_to_stem: &mut HashMap<String, String>,
) {
    let lines: Vec<&str> = content.lines().collect();

    for line in &lines {
        let trimmed = line.trim();

        // Global prefix: app.setGlobalPrefix('api/v1')
        if trimmed.contains("setGlobalPrefix(") {
            if let Some(pos) = trimmed.find("setGlobalPrefix(") {
                let rest = &trimmed[pos + "setGlobalPrefix(".len()..];
                if let Some(pfx) = extract_string_literal(rest) {
                    let normalized = if pfx.starts_with('/') {
                        pfx
                    } else {
                        format!("/{}", pfx)
                    };
                    mount_map.detected_api_prefix = Some(normalized);
                }
            }
        }

        // Imports / Requires: const cycleRouter = require('./routes/cycle.route');
        if trimmed.starts_with("const ") || trimmed.starts_with("let ") || trimmed.starts_with("var ") {
            if let Some(eq_pos) = trimmed.find('=') {
                let var_part = trimmed[..eq_pos].trim();
                let val_part = trimmed[eq_pos + 1..].trim();
                let var_name = var_part.split_whitespace().last().unwrap_or("");

                if val_part.contains("require(") {
                    if let Some(req_pos) = val_part.find("require(") {
                        let rest = &val_part[req_pos + "require(".len()..];
                        if let Some(import_path) = extract_string_literal(rest) {
                            let stem = Path::new(&import_path)
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or(&import_path);
                            var_to_stem.insert(var_name.to_string(), stem.to_string());
                        }
                    }
                }
            }
        } else if trimmed.starts_with("import ") {
            if let Some(from_pos) = trimmed.find(" from ") {
                let import_part = trimmed["import ".len()..from_pos].trim();
                let from_part = trimmed[from_pos + " from ".len()..].trim();
                let var_name = import_part.trim_matches('{').trim_matches('}').trim();
                if let Some(import_path) = extract_string_literal(from_part) {
                    let stem = Path::new(&import_path)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&import_path);
                    var_to_stem.insert(var_name.to_string(), stem.to_string());
                }
            }
        }

        // app.use('...', ...) or router.use('...', ...) or register
        if (trimmed.contains(".use(") || trimmed.contains(".register(")) && !trimmed.starts_with("//") {
            let use_kw = if trimmed.contains(".use(") { ".use(" } else { ".register(" };
            if let Some(pos) = trimmed.find(use_kw) {
                let args_part = &trimmed[pos + use_kw.len()..];
                if let Some(mount_path) = extract_string_literal(args_part) {
                    let normalized_mount = if mount_path.starts_with('/') {
                        mount_path
                    } else {
                        format!("/{}", mount_path)
                    };

                    // Detect global API prefix
                    if mount_map.detected_api_prefix.is_none() {
                        if normalized_mount.starts_with("/api/v1") {
                            mount_map.detected_api_prefix = Some("/api/v1".to_string());
                        } else if normalized_mount.starts_with("/api/v2") {
                            mount_map.detected_api_prefix = Some("/api/v2".to_string());
                        } else if normalized_mount.starts_with("/api") {
                            mount_map.detected_api_prefix = Some("/api".to_string());
                        }
                    }

                    // Check for inline require: app.use('/api/cycle', require('./routes/cycle.route'))
                    if args_part.contains("require(") {
                        if let Some(req_pos) = args_part.find("require(") {
                            let req_rest = &args_part[req_pos + "require(".len()..];
                            if let Some(req_path) = extract_string_literal(req_rest) {
                                let stem = Path::new(&req_path)
                                    .file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or(&req_path);
                                mount_map.stem_to_mount.insert(stem.to_string(), normalized_mount.clone());
                                mount_map.stem_to_mount.insert(clean_stem(stem), normalized_mount.clone());
                            }
                        }
                    } else {
                        // Identifier after comma: app.use('/api/cycle', cycleRouter)
                        let after_first_comma = args_part.split(',').skip(1);
                        for piece in after_first_comma {
                            let clean_arg = piece
                                .trim()
                                .trim_matches(')')
                                .trim_matches(';')
                                .trim();
                            if !clean_arg.is_empty() && !clean_arg.starts_with('{') {
                                mount_map.var_to_mount.insert(clean_arg.to_string(), normalized_mount.clone());
                                if let Some(stem) = var_to_stem.get(clean_arg) {
                                    mount_map.stem_to_mount.insert(stem.clone(), normalized_mount.clone());
                                    mount_map.stem_to_mount.insert(clean_stem(stem), normalized_mount.clone());
                                }
                                let lower_var = clean_arg.to_lowercase();
                                let clean_var = lower_var
                                    .replace("router", "")
                                    .replace("routes", "")
                                    .replace("route", "")
                                    .replace("controller", "");
                                if !clean_var.is_empty() {
                                    mount_map.stem_to_mount.insert(clean_var, normalized_mount.clone());
                                }
                            }
                        }
                    }
                }
            }
        }

        // Python FastAPI: app.include_router(cycle_router, prefix="/api/cycle")
        if trimmed.contains("include_router(") && trimmed.contains("prefix=") {
            if let Some(pfx_pos) = trimmed.find("prefix=") {
                let rest = &trimmed[pfx_pos + "prefix=".len()..];
                if let Some(pfx) = extract_string_literal(rest) {
                    let normalized = if pfx.starts_with('/') { pfx } else { format!("/{}", pfx) };
                    if let Some(inc_pos) = trimmed.find("include_router(") {
                        let inner = &trimmed[inc_pos + "include_router(".len()..];
                        if let Some(comma_pos) = inner.find(',') {
                            let router_name = inner[..comma_pos].trim();
                            mount_map.var_to_mount.insert(router_name.to_string(), normalized.clone());
                            let clean = router_name
                                .replace("_router", "")
                                .replace("router", "")
                                .replace("_routes", "")
                                .replace("routes", "");
                            mount_map.stem_to_mount.insert(clean, normalized.clone());
                        }
                    }
                }
            }
        }

        // NestJS: @Controller('api/v1/auth') or @Controller('auth')
        if let Some(rest) = trimmed.strip_prefix("@Controller(") {
            if let Some(pfx) = extract_string_literal(rest) {
                let normalized = if pfx.starts_with('/') { pfx } else { format!("/{}", pfx) };
                mount_map.file_to_mount.insert(relative_path.to_string(), normalized);
            }
        }

        // Java Spring: @RequestMapping("/api/v1/auth")
        if let Some(rest) = trimmed.strip_prefix("@RequestMapping(") {
            if !trimmed.contains("method") {
                if let Some(pfx) = extract_string_literal(rest) {
                    let normalized = if pfx.starts_with('/') { pfx } else { format!("/{}", pfx) };
                    mount_map.file_to_mount.insert(relative_path.to_string(), normalized);
                }
            }
        }
    }
}

/// Harvests route patterns from a single source file without prefix (backwards-compatible).
#[allow(dead_code)]
pub fn harvest_endpoints_from_file(
    relative_path: &str,
    content: &str,
) -> (Vec<AiScannedEndpoint>, String) {
    harvest_endpoints_from_file_with_prefix(relative_path, content, None)
}

/// Harvests route patterns from a source file applying resolved mount prefix.
pub fn harvest_endpoints_from_file_with_prefix(
    relative_path: &str,
    content: &str,
    mount_prefix: Option<&str>,
) -> (Vec<AiScannedEndpoint>, String) {
    let mut endpoints = Vec::new();
    let mut framework = String::new();

    let lines: Vec<&str> = content.lines().collect();

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        // 1. Python routes (FastAPI / Flask / Django)
        if trimmed.starts_with("@app.")
            || trimmed.starts_with("@router.")
            || trimmed.starts_with("@api.")
        {
            if let Some((method, raw_path)) = extract_python_decorator(trimmed) {
                framework = "Python (FastAPI/Flask)".to_string();
                let full_path = combine_route_path(mount_prefix.unwrap_or(""), &raw_path);
                let ep = build_scanned_endpoint(
                    relative_path,
                    idx + 1,
                    &method,
                    &full_path,
                    &lines,
                    idx,
                    &framework,
                );
                endpoints.push(ep);
            }
        }
        // 2. TypeScript/JavaScript routes (Express / Fastify / Hono)
        else if (trimmed.contains("router.") || trimmed.contains("app."))
            && (trimmed.contains(".get(")
                || trimmed.contains(".post(")
                || trimmed.contains(".put(")
                || trimmed.contains(".delete(")
                || trimmed.contains(".patch("))
        {
            if let Some((method, raw_path)) = extract_express_route(trimmed) {
                framework = "Node.js (Express/Fastify)".to_string();
                let full_path = combine_route_path(mount_prefix.unwrap_or(""), &raw_path);
                let ep = build_scanned_endpoint(
                    relative_path,
                    idx + 1,
                    &method,
                    &full_path,
                    &lines,
                    idx,
                    &framework,
                );
                endpoints.push(ep);
            }
        }
        // 3. NestJS Decorators (@Get, @Post, etc.)
        else if trimmed.starts_with("@Get(")
            || trimmed.starts_with("@Post(")
            || trimmed.starts_with("@Put(")
            || trimmed.starts_with("@Delete(")
            || trimmed.starts_with("@Patch(")
        {
            if let Some((method, raw_path)) = extract_nestjs_decorator(trimmed) {
                framework = "NestJS".to_string();
                let full_path = combine_route_path(mount_prefix.unwrap_or(""), &raw_path);
                let ep = build_scanned_endpoint(
                    relative_path,
                    idx + 1,
                    &method,
                    &full_path,
                    &lines,
                    idx,
                    &framework,
                );
                endpoints.push(ep);
            }
        }
        // 4. Go routes (Gin / Echo / Chi)
        else if (trimmed.contains("r.") || trimmed.contains("router.") || trimmed.contains("e."))
            && (trimmed.contains(".GET(")
                || trimmed.contains(".POST(")
                || trimmed.contains(".PUT(")
                || trimmed.contains(".DELETE(")
                || trimmed.contains(".PATCH("))
        {
            if let Some((method, raw_path)) = extract_go_route(trimmed) {
                framework = "Go (Gin/Echo/Chi)".to_string();
                let full_path = combine_route_path(mount_prefix.unwrap_or(""), &raw_path);
                let ep = build_scanned_endpoint(
                    relative_path,
                    idx + 1,
                    &method,
                    &full_path,
                    &lines,
                    idx,
                    &framework,
                );
                endpoints.push(ep);
            }
        }
        // 5. Java / Spring Boot (@GetMapping, @PostMapping)
        else if trimmed.starts_with("@GetMapping")
            || trimmed.starts_with("@PostMapping")
            || trimmed.starts_with("@PutMapping")
            || trimmed.starts_with("@DeleteMapping")
            || trimmed.starts_with("@PatchMapping")
        {
            if let Some((method, raw_path)) = extract_spring_decorator(trimmed) {
                framework = "Java (Spring Boot)".to_string();
                let full_path = combine_route_path(mount_prefix.unwrap_or(""), &raw_path);
                let ep = build_scanned_endpoint(
                    relative_path,
                    idx + 1,
                    &method,
                    &full_path,
                    &lines,
                    idx,
                    &framework,
                );
                endpoints.push(ep);
            }
        }
    }

    (endpoints, framework)
}

/// Combines a mount prefix (e.g. "/api/cycle") and a sub-route (e.g. "/quick-notes" or "/")
pub fn combine_route_path(prefix: &str, raw_path: &str) -> String {
    let clean_prefix = prefix.trim().trim_matches('/');
    let clean_raw = raw_path.trim().trim_matches('/');

    if clean_prefix.is_empty() {
        if clean_raw.is_empty() {
            return "/".to_string();
        }
        return format!("/{}", clean_raw);
    }

    // If raw_path already starts with clean_prefix, don't duplicate
    if clean_raw.starts_with(clean_prefix) {
        return format!("/{}", clean_raw);
    }

    if clean_raw.is_empty() {
        if raw_path.ends_with('/') {
            return format!("/{}/", clean_prefix);
        }
        return format!("/{}", clean_prefix);
    }

    if raw_path.ends_with('/') {
        format!("/{}/{}/", clean_prefix, clean_raw)
    } else {
        format!("/{}/{}", clean_prefix, clean_raw)
    }
}

fn extract_python_decorator(line: &str) -> Option<(String, String)> {
    let methods = ["get", "post", "put", "delete", "patch"];
    for m in methods {
        let pattern = format!(".{}(", m);
        if let Some(pos) = line.find(&pattern) {
            let rest = &line[pos + pattern.len()..];
            if let Some(path) = extract_string_literal(rest) {
                return Some((m.to_uppercase(), path));
            }
        }
    }
    None
}

fn extract_express_route(line: &str) -> Option<(String, String)> {
    let methods = ["get", "post", "put", "delete", "patch"];
    for m in methods {
        let pattern = format!(".{}(", m);
        if let Some(pos) = line.find(&pattern) {
            let rest = &line[pos + pattern.len()..];
            if let Some(path) = extract_string_literal(rest) {
                return Some((m.to_uppercase(), path));
            }
        }
    }
    None
}

fn extract_nestjs_decorator(line: &str) -> Option<(String, String)> {
    let methods = ["Get", "Post", "Put", "Delete", "Patch"];
    for m in methods {
        let prefix = format!("@{}(", m);
        if line.starts_with(&prefix) {
            let rest = &line[prefix.len()..];
            let path = extract_string_literal(rest).unwrap_or_else(|| "/".to_string());
            return Some((m.to_uppercase(), path));
        }
    }
    None
}

fn extract_go_route(line: &str) -> Option<(String, String)> {
    let methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
    for m in methods {
        let pattern = format!(".{}(", m);
        if let Some(pos) = line.find(&pattern) {
            let rest = &line[pos + pattern.len()..];
            if let Some(path) = extract_string_literal(rest) {
                return Some((m.to_string(), path));
            }
        }
    }
    None
}

fn extract_spring_decorator(line: &str) -> Option<(String, String)> {
    let mapping = [
        ("@GetMapping", "GET"),
        ("@PostMapping", "POST"),
        ("@PutMapping", "PUT"),
        ("@DeleteMapping", "DELETE"),
        ("@PatchMapping", "PATCH"),
    ];

    for (prefix, method) in mapping {
        if line.starts_with(prefix) {
            let rest = line.trim_start_matches(prefix);
            let path = if let Some(stripped) = rest.strip_prefix('(') {
                extract_string_literal(stripped).unwrap_or_else(|| "/".to_string())
            } else {
                "/".to_string()
            };
            return Some((method.to_string(), path));
        }
    }
    None
}

fn extract_string_literal(s: &str) -> Option<String> {
    let trimmed = s.trim();
    let quote_char = if trimmed.starts_with('"') {
        Some('"')
    } else if trimmed.starts_with('\'') {
        Some('\'')
    } else if trimmed.starts_with('`') {
        Some('`')
    } else {
        None
    }?;

    let after_quote = &trimmed[1..];
    if let Some(end_idx) = after_quote.find(quote_char) {
        return Some(after_quote[..end_idx].to_string());
    }
    None
}

fn build_scanned_endpoint(
    relative_path: &str,
    line_number: usize,
    method: &str,
    raw_path: &str,
    lines: &[&str],
    line_idx: usize,
    framework: &str,
) -> AiScannedEndpoint {
    // 1. Normalize path: {id} -> :id
    let mut normalized_path = raw_path.trim().to_string();
    if !normalized_path.starts_with('/') {
        normalized_path = format!("/{}", normalized_path);
    }
    let re_curly = normalized_path.replace('{', ":").replace('}', "");
    normalized_path = re_curly;

    // 2. Parse path parameters
    let mut params = Vec::new();
    for segment in normalized_path.split('/') {
        if let Some(param_name) = segment.strip_prefix(':') {
            params.push(AiKeyValue {
                id: format!("p_{}", params.len()),
                key: param_name.to_string(),
                value: "1".to_string(),
                enabled: true,
            });
        }
    }

    // 3. Inspect adjacent lines for docstrings, auth, or model schemas
    let mut snippet = String::new();
    let start_idx = line_idx.saturating_sub(2);
    let end_idx = (line_idx + 8).min(lines.len());
    for l in &lines[start_idx..end_idx] {
        snippet.push_str(l);
        snippet.push('\n');
    }

    let snippet_lower = snippet.to_lowercase();
    let requires_auth = snippet_lower.contains("auth")
        || snippet_lower.contains("token")
        || snippet_lower.contains("bearer")
        || snippet_lower.contains("protected")
        || snippet_lower.contains("jwt")
        || snippet_lower.contains("admin");

    let auth_type = if requires_auth {
        Some("bearer".to_string())
    } else {
        None
    };

    let mut headers = Vec::new();
    if requires_auth {
        headers.push(AiKeyValue {
            id: "h_auth".to_string(),
            key: "Authorization".to_string(),
            value: "Bearer {{AUTH_TOKEN}}".to_string(),
            enabled: true,
        });
    }

    // 4. Synthesize mock request body for mutation methods
    let is_mutation = matches!(method, "POST" | "PUT" | "PATCH");
    let (body_type, body) = if is_mutation {
        headers.push(AiKeyValue {
            id: format!("h_{}", headers.len()),
            key: "Content-Type".to_string(),
            value: "application/json".to_string(),
            enabled: true,
        });
        ("json".to_string(), synthesize_mock_body_for_path(&normalized_path))
    } else {
        ("none".to_string(), String::new())
    };

    // 5. Generate human readable name & folder hierarchy
    let folder = determine_folder_hierarchy(&normalized_path, relative_path);
    let name = generate_endpoint_name(method, &normalized_path);

    AiScannedEndpoint {
        id: format!("ep_{}_{}_{}", method, normalized_path.replace('/', "_"), line_number),
        name,
        method: method.to_string(),
        path: normalized_path,
        description: Some(format!("Discovered in {} line {}", relative_path, line_number)),
        folder,
        headers,
        params,
        body_type,
        body,
        source_file: relative_path.to_string(),
        line_number: Some(line_number),
        framework: framework.to_string(),
        requires_auth,
        auth_type,
    }
}

/// Determines the nested folder hierarchy for an endpoint.
pub fn determine_folder_hierarchy(path: &str, file_path: &str) -> Vec<String> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    // Strip "api", "v1", "v2", "v3", etc. and path parameter segments like ":id"
    let domain_segments: Vec<&str> = segments
        .iter()
        .copied()
        .filter(|s| {
            let lower = s.to_lowercase();
            if lower == "api" {
                return false;
            }
            if lower.starts_with('v') && lower.len() >= 2 && lower[1..].chars().all(|c| c.is_ascii_digit()) {
                return false;
            }
            !s.starts_with(':')
        })
        .collect();

    if !domain_segments.is_empty() {
        let root_domain = capitalize(domain_segments[0]);
        let mut hierarchy = vec![root_domain];

        // If there's a 2nd domain segment that represents a sub-resource (not an action verb)
        if domain_segments.len() >= 2 {
            let sub = domain_segments[1];
            let sub_lower = sub.to_lowercase();
            let is_action_verb = matches!(
                sub_lower.as_str(),
                "bulk" | "sync" | "me" | "login" | "register" | "logout" | "status" | "ping" | "health"
            );
            if !is_action_verb {
                hierarchy.push(humanize_segment(sub));
            }
        }
        return hierarchy;
    }

    // Fallback to file_path stem
    if let Some(file_stem) = Path::new(file_path).file_stem().and_then(|s| s.to_str()) {
        let clean = clean_stem(file_stem);
        if !clean.is_empty() && clean != "index" && clean != "app" && clean != "server" && clean != "main" {
            return vec![capitalize(&clean)];
        }
    }

    vec!["General".to_string()]
}

fn generate_endpoint_name(method: &str, path: &str) -> String {
    let segments: Vec<&str> = path.trim_matches('/').split('/').collect();
    let last = segments.last().copied().unwrap_or("resource");

    if last.starts_with(':') {
        let entity = if segments.len() >= 2 {
            segments[segments.len() - 2]
        } else {
            "Item"
        };
        match method {
            "GET" => format!("Get {} by ID", humanize_segment(entity)),
            "PUT" | "PATCH" => format!("Update {} by ID", humanize_segment(entity)),
            "DELETE" => format!("Delete {} by ID", humanize_segment(entity)),
            _ => format!("{} {}", method, path),
        }
    } else {
        let label = humanize_segment(last);
        match method {
            "POST" => {
                if label.eq_ignore_ascii_case("login")
                    || label.eq_ignore_ascii_case("register")
                    || label.eq_ignore_ascii_case("logout")
                    || label.eq_ignore_ascii_case("sync")
                {
                    label
                } else {
                    format!("Create {}", label)
                }
            }
            "GET" => {
                if label.ends_with('s') {
                    format!("List {}", label)
                } else {
                    format!("Get {}", label)
                }
            }
            "DELETE" => format!("Delete {}", label),
            "PUT" => format!("Update {}", label),
            "PATCH" => format!("Patch {}", label),
            _ => format!("{} {}", method, label),
        }
    }
}

fn synthesize_mock_body_for_path(path: &str) -> String {
    let p = path.to_lowercase();

    if p.contains("auth") || p.contains("login") || p.contains("signin") {
        return serde_json::to_string_pretty(&serde_json::json!({
            "email": "user@example.com",
            "password": "Password123!"
        }))
        .unwrap_or_default();
    }

    if p.contains("register") || p.contains("signup") {
        return serde_json::to_string_pretty(&serde_json::json!({
            "email": "user@example.com",
            "password": "Password123!",
            "name": "Jane Doe",
            "role": "user"
        }))
        .unwrap_or_default();
    }

    if p.contains("user") || p.contains("profile") {
        return serde_json::to_string_pretty(&serde_json::json!({
            "name": "Alex Johnson",
            "email": "alex@example.com",
            "avatarUrl": "https://avatar.example.com/alex.jpg"
        }))
        .unwrap_or_default();
    }

    if p.contains("order") || p.contains("checkout") {
        return serde_json::to_string_pretty(&serde_json::json!({
            "items": [
                { "productId": "prod_101", "quantity": 2, "price": 49.99 }
            ],
            "shippingAddress": {
                "street": "123 Main St",
                "city": "San Francisco",
                "zip": "94105"
            }
        }))
        .unwrap_or_default();
    }

    serde_json::to_string_pretty(&serde_json::json!({
        "title": "Sample Item",
        "description": "Generated by Needle AI Scanner",
        "active": true
    }))
    .unwrap_or_default()
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().chain(chars).collect(),
    }
}

fn humanize_segment(s: &str) -> String {
    let clean = s.trim_start_matches(':');
    let words: Vec<String> = clean
        .split(['-', '_'])
        .filter(|w| !w.is_empty())
        .map(capitalize)
        .collect();
    if words.is_empty() {
        capitalize(clean)
    } else {
        words.join(" ")
    }
}

fn clean_stem(stem: &str) -> String {
    stem.replace(".controller", "")
        .replace(".route", "")
        .replace(".router", "")
        .replace(".routes", "")
        .replace("_controller", "")
        .replace("_routes", "")
        .replace("_route", "")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_python_fastapi_harvesting() {
        let code = r#"
@app.get("/users/{user_id}")
def get_user(user_id: int):
    return {"user_id": user_id}

@app.post("/api/v1/auth/login")
def login_user(creds: LoginDto):
    """User authentication route"""
    return {"token": "xyz"}
"#;
        let (endpoints, fw) = harvest_endpoints_from_file("api/routes.py", code);
        assert_eq!(fw, "Python (FastAPI/Flask)");
        assert_eq!(endpoints.len(), 2);

        assert_eq!(endpoints[0].method, "GET");
        assert_eq!(endpoints[0].path, "/users/:user_id");
        assert_eq!(endpoints[0].params.len(), 1);
        assert_eq!(endpoints[0].params[0].key, "user_id");

        assert_eq!(endpoints[1].method, "POST");
        assert_eq!(endpoints[1].path, "/api/v1/auth/login");
        assert_eq!(endpoints[1].body_type, "json");
        assert!(endpoints[1].body.contains("email"));
        assert!(endpoints[1].requires_auth);
    }

    #[test]
    fn test_express_harvesting() {
        let code = r#"
router.get('/products', listProducts);
router.post('/orders', requireAuth, createOrder);
"#;
        let (endpoints, fw) = harvest_endpoints_from_file("src/routes.ts", code);
        assert_eq!(fw, "Node.js (Express/Fastify)");
        assert_eq!(endpoints.len(), 2);
        assert_eq!(endpoints[0].method, "GET");
        assert_eq!(endpoints[0].path, "/products");
        assert_eq!(endpoints[1].method, "POST");
        assert_eq!(endpoints[1].path, "/orders");
    }

    #[test]
    fn test_express_mount_resolution_and_hierarchy() {
        // App file with app.use mounts
        let app_code = r#"
const cycleRouter = require('./routes/cycle.route');
const authRouter = require('./routes/auth.route');
app.use('/api/cycle', cycleRouter);
app.use('/api/auth', authRouter);
"#;
        let mut mount_map = ProjectMountMap::default();
        let mut var_to_stem = HashMap::new();
        parse_mounts_from_content("src/app.js", app_code, &mut mount_map, &mut var_to_stem);
        for (var, stem) in &var_to_stem {
            if let Some(mount) = mount_map.var_to_mount.get(var) {
                mount_map.stem_to_mount.insert(stem.clone(), mount.clone());
                mount_map.stem_to_mount.insert(clean_stem(stem), mount.clone());
            }
        }

        assert_eq!(mount_map.resolve_mount_prefix("src/routes/cycle.route.js"), "/api/cycle");
        assert_eq!(mount_map.resolve_mount_prefix("src/routes/auth.route.js"), "/api/auth");

        // Cycle route file with root, action, and nested sub-resources
        let cycle_code = r#"
router.post('/', createCycle);
router.get('/', listCycle);
router.delete('/bulk', deleteBulk);
router.delete('/:id', deleteOne);
router.get('/quick-notes', listNotes);
router.post('/quick-notes', createNote);
router.put('/quick-notes/:id', updateNote);
router.delete('/quick-notes/:id', deleteNote);
router.post('/quick-notes/sync', syncNotes);
"#;
        let pfx = mount_map.resolve_mount_prefix("src/routes/cycle.route.js");
        let (endpoints, _) = harvest_endpoints_from_file_with_prefix("src/routes/cycle.route.js", cycle_code, Some(&pfx));
        assert_eq!(endpoints.len(), 9);

        // Verify full paths
        assert_eq!(endpoints[0].path, "/api/cycle/");
        assert_eq!(endpoints[1].path, "/api/cycle/");
        assert_eq!(endpoints[2].path, "/api/cycle/bulk");
        assert_eq!(endpoints[3].path, "/api/cycle/:id");
        assert_eq!(endpoints[4].path, "/api/cycle/quick-notes");
        assert_eq!(endpoints[6].path, "/api/cycle/quick-notes/:id");
        assert_eq!(endpoints[8].path, "/api/cycle/quick-notes/sync");

        // Verify folder hierarchy
        assert_eq!(endpoints[0].folder, vec!["Cycle".to_string()]);
        assert_eq!(endpoints[2].folder, vec!["Cycle".to_string()]); // /bulk stays under Cycle!
        assert_eq!(endpoints[3].folder, vec!["Cycle".to_string()]); // /:id stays under Cycle!
        assert_eq!(endpoints[4].folder, vec!["Cycle".to_string(), "Quick Notes".to_string()]); // nested!
        assert_eq!(endpoints[6].folder, vec!["Cycle".to_string(), "Quick Notes".to_string()]); // nested!

        // Auth route file
        let auth_code = r#"
router.post('/register', register);
router.post('/login', login);
router.post('/token/refresh', refresh);
router.post('/logout', logout);
"#;
        let auth_pfx = mount_map.resolve_mount_prefix("src/routes/auth.route.js");
        let (auth_eps, _) = harvest_endpoints_from_file_with_prefix("src/routes/auth.route.js", auth_code, Some(&auth_pfx));
        assert_eq!(auth_eps.len(), 4);
        assert_eq!(auth_eps[0].path, "/api/auth/register");
        assert_eq!(auth_eps[1].path, "/api/auth/login");
        assert_eq!(auth_eps[2].path, "/api/auth/token/refresh");
        assert_eq!(auth_eps[0].folder, vec!["Auth".to_string()]);
        assert_eq!(auth_eps[1].folder, vec!["Auth".to_string()]);
        assert_eq!(auth_eps[2].folder, vec!["Auth".to_string(), "Token".to_string()]);
    }

    #[test]
    fn test_go_gin_harvesting() {
        let code = r#"
r.GET("/health", healthHandler)
r.POST("/api/v1/checkout", checkoutHandler)
"#;
        let (endpoints, fw) = harvest_endpoints_from_file("main.go", code);
        assert_eq!(fw, "Go (Gin/Echo/Chi)");
        assert_eq!(endpoints.len(), 2);
        assert_eq!(endpoints[0].method, "GET");
        assert_eq!(endpoints[1].method, "POST");
    }
}
