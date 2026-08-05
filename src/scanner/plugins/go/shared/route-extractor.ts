import type { HttpMethod } from "../../../models/endpoint";
import type { RawRoute } from "./types";
import {
  extractPathParamsFromPattern,
  folderFromPathAndFile,
  humanizeHandlerName,
  joinPaths,
  lineNumberAtIndex,
  normalizePath,
} from "./path-utils";
import type { HandlerEnrichment } from "./handler-extractor";

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "CONNECT",
  "QUERY",
]);

/** Extract Go string literal (double quotes or backticks). */
export function extractGoStringLiteral(source: string, startIndex: number): string | null {
  const slice = source.slice(startIndex).trimStart();
  const skipped = source.slice(startIndex).length - slice.length;
  const absStart = startIndex + skipped;

  if (slice.startsWith("`")) {
    const end = slice.indexOf("`", 1);
    if (end < 0) return null;
    return slice.slice(1, end);
  }
  if (slice.startsWith('"')) {
    let i = 1;
    let value = "";
    while (i < slice.length) {
      const ch = slice[i];
      if (ch === "\\") {
        const next = slice[i + 1];
        if (next === "n") value += "\n";
        else if (next === "t") value += "\t";
        else if (next === '"') value += '"';
        else if (next === "\\") value += "\\";
        else value += next ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') return value;
      value += ch;
      i++;
    }
  }
  void absStart;
  return null;
}

export function findMatchingParenEnd(source: string, openParenIndex: number): number {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export function findMatchingBraceEnd(source: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export function parseHttpMethod(value: string): HttpMethod | null {
  const upper = value.toUpperCase();
  return HTTP_METHODS.has(upper) ? (upper as HttpMethod) : null;
}

export interface BoundRouteCall {
  method: HttpMethod;
  path: string;
  handler?: string;
  index: number;
  endIndex: number;
}

const GIN_ECHO_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "Any",
  "Handle",
];

/**
 * Parse Gin/Echo style: `r.GET("/path", handler)` with bounded call args.
 */
export function parseGinEchoMethodCalls(source: string): BoundRouteCall[] {
  const results: BoundRouteCall[] = [];
  const methodAlt = GIN_ECHO_METHODS.join("|");
  const re = new RegExp(
    `\\.\\s*(${methodAlt})\\s*\\(`,
    "g",
  );

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const methodName = match[1];
    const openParen = match.index + match[0].length - 1;
    const closeParen = findMatchingParenEnd(source, openParen);
    if (closeParen < 0) continue;

    const inner = source.slice(openParen + 1, closeParen - 1);

    if (methodName === "Handle") {
      // Handle("GET", "/path", handler) or Handle(http.MethodGet, ...)
      const parsed = parseHandleArgs(inner);
      if (parsed) {
        results.push({
          ...parsed,
          index: match.index,
          endIndex: closeParen,
        });
      }
      continue;
    }

    if (methodName === "Any") {
      // Prefer a single GET placeholder over exploding into 5 methods (noisy/false positives)
      const path = extractGoStringLiteral(inner, 0);
      if (path == null) continue;
      const handler = extractRouteHandler(inner);
      results.push({
        method: "GET",
        path,
        handler,
        index: match.index,
        endIndex: closeParen,
      });
      continue;
    }

    const httpMethod = parseHttpMethod(methodName);
    if (!httpMethod) continue;
    // Allow empty path "" for group-relative routes (e.g. notes.POST("", create))
    const path = extractGoStringLiteral(inner, 0);
    if (path == null) continue;
    const handler = extractRouteHandler(inner);
    results.push({
      method: httpMethod,
      path,
      handler,
      index: match.index,
      endIndex: closeParen,
    });
  }

  return results;
}

function parseHandleArgs(
  inner: string,
): { method: HttpMethod; path: string; handler?: string } | null {
  // "GET", "/path", handler
  const methodLit = extractGoStringLiteral(inner, 0);
  let method: HttpMethod | null = methodLit ? parseHttpMethod(methodLit) : null;

  if (!method) {
    // http.MethodGet
    const constMatch = inner.match(/http\.Method(\w+)/);
    if (constMatch) method = parseHttpMethod(constMatch[1]);
  }
  if (!method) return null;

  // Find path string after first comma
  const comma = findTopLevelComma(inner);
  if (comma < 0) return null;
  const afterMethod = inner.slice(comma + 1);
  const path = extractGoStringLiteral(afterMethod, 0);
  if (path == null) return null;
  const handler = extractRouteHandler(afterMethod);
  return { method, path, handler };
}

function findTopLevelComma(inner: string): number {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (ch === "," && depth === 0) return i;
  }
  return -1;
}

function extractRouteHandler(inner: string): string | undefined {
  // Args: path, ...handlers — Gin/Echo put the final handler last; middleware often looks like pkg.Fn()
  const parts = splitTopLevelArgs(inner);
  // Skip the path (first arg)
  const candidates = parts.slice(1).map((p) => p.trim()).filter(Boolean);

  for (let i = candidates.length - 1; i >= 0; i--) {
    const arg = candidates[i];
    if (arg.startsWith("func") || arg.startsWith('"') || arg.startsWith("`")) continue;
    // Skip middleware-style calls: Auth(), middleware.JWT()
    if (/\(\s*\)$/.test(arg) || /\([^)]*\)$/.test(arg)) continue;
    const nameMatch = arg.match(
      /^((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)$/,
    );
    if (nameMatch) return nameMatch[1];
  }

  // Fallback: first identifier after path
  for (const arg of candidates) {
    const nameMatch = arg.match(
      /^((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)/,
    );
    if (nameMatch && !nameMatch[0].startsWith("func")) return nameMatch[1];
  }
  return undefined;
}

function splitTopLevelArgs(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let inStr: '"' | "`" | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      current += ch;
      if (ch === inStr && inner[i - 1] !== "\\") inStr = null;
      continue;
    }
    if (ch === '"' || ch === "`") {
      inStr = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Parse Chi style: `r.Get("/path", handler)` (capitalized method names).
 */
export function parseChiMethodCalls(source: string): BoundRouteCall[] {
  const results: BoundRouteCall[] = [];
  const re =
    /\.\s*(Get|Post|Put|Patch|Delete|Head|Options|Connect|Trace|Method|MethodFunc)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const methodName = match[1];
    const openParen = match.index + match[0].length - 1;
    const closeParen = findMatchingParenEnd(source, openParen);
    if (closeParen < 0) continue;
    const inner = source.slice(openParen + 1, closeParen - 1);

    if (methodName === "Method" || methodName === "MethodFunc") {
      const parsed = parseHandleArgs(inner);
      if (parsed) {
        results.push({ ...parsed, index: match.index, endIndex: closeParen });
      }
      continue;
    }

    const httpMethod = parseHttpMethod(methodName);
    if (!httpMethod) continue;
    const path = extractGoStringLiteral(inner, 0);
    if (path == null) continue;
    const handler = extractRouteHandler(inner);
    results.push({
      method: httpMethod,
      path,
      handler,
      index: match.index,
      endIndex: closeParen,
    });
  }

  return results;
}

export interface GroupBlock {
  prefix: string;
  startIndex: number;
  endIndex: number;
  variable?: string;
}

/**
 * Track Gin/Echo `x.Group("/api")` and assignment `api := r.Group("/api")`.
 * Returns prefix ranges for nested route composition.
 */
export function extractGroupAssignments(source: string): Array<{
  variable: string;
  prefix: string;
  index: number;
}> {
  const results: Array<{ variable: string; prefix: string; index: number }> = [];

  // api := r.Group("/api")  or  api = r.Group("/api")
  const assignRe =
    /([A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*[A-Za-z_][A-Za-z0-9_]*\.Group\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = assignRe.exec(source)) !== null) {
    const variable = match[1];
    const openParen = match.index + match[0].length - 1;
    const prefix = extractGoStringLiteral(source, openParen + 1);
    if (!prefix) continue;
    results.push({ variable, prefix: normalizePath(prefix), index: match.index });
  }

  return results;
}

/**
 * Resolve the effective prefix for a route call by looking at receiver variable
 * and known group assignments, including nested groups via variable chain.
 */
export function resolveGroupPrefixForCall(
  source: string,
  callIndex: number,
  groups: Array<{ variable: string; prefix: string; index: number }>,
): string {
  // Find receiver before `.GET(` : look back for identifier
  const before = source.slice(Math.max(0, callIndex - 80), callIndex);
  const recvMatch = before.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  if (!recvMatch) return "";

  const receiver = recvMatch[1];
  // Collect prefixes for this variable and parents by scanning earlier assignments
  // For nested: notes := api.Group("/notes") where api := r.Group("/api")
  const applicable = groups.filter((g) => g.index < callIndex);
  return composeVariablePrefix(receiver, applicable);
}

function composeVariablePrefix(
  variable: string,
  groups: Array<{ variable: string; prefix: string; index: number }>,
): string {
  // Build map of variable -> {prefix, parentVar?}
  // We only store direct Group() prefix; parent is inferred if assignment was `x := parent.Group`
  // Re-parse isn't available here — approximate by chaining all matching vars that share lineage.
  // Simpler approach: find the group entry for this variable, then if another group was assigned
  // earlier to a var that appears as receiver in that assignment line... 

  const byVar = new Map<string, { prefix: string; index: number }>();
  for (const g of groups) {
    byVar.set(g.variable, { prefix: g.prefix, index: g.index });
  }

  const prefixes: string[] = [];
  let current: string | undefined = variable;
  const seen = new Set<string>();

  while (current && byVar.has(current) && !seen.has(current)) {
    seen.add(current);
    const entry = byVar.get(current)!;
    prefixes.unshift(entry.prefix);

    // Find parent: look for `current := PARENT.Group` in original — we need source.
    // Without source, stop after one level unless we encode parent in groups.
    break;
  }

  // Enhanced: groups already may include full composed prefixes if we build them in extractGroupTree
  return prefixes.join("/").replace(/\/{2,}/g, "/") || (byVar.get(variable)?.prefix ?? "");
}

/**
 * Build group variable → full composed prefix map using assignment source text.
 * Supports nested: notes := api.Group("/notes") where api := r.Group("/api")
 * Allows empty prefixes Group("").
 */
export function buildGroupPrefixMap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  // Match: var := recv.Group("prefix")  including multi-line
  const assignRe =
    /([A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*([A-Za-z_][A-Za-z0-9_]*)\.Group\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = assignRe.exec(source)) !== null) {
    const variable = match[1];
    const parent = match[2];
    const openParen = match.index + match[0].length - 1;
    const prefix = extractGoStringLiteral(source, openParen + 1);
    if (prefix == null) continue;

    const parentPrefix = map.get(parent) ?? "";
    const full = joinPaths(parentPrefix, prefix || "/");
    map.set(variable, full === "/" && !prefix ? parentPrefix || "/" : full);
    // If prefix is empty, inherit parent only
    if (prefix === "") {
      map.set(variable, parentPrefix || "/");
    }
  }

  return map;
}

/**
 * Prefixes from chained Group calls on the same statement:
 *   r.Group("/api").Group("/v1").GET("/notes", h)
 */
export function getInlineGroupChainPrefix(source: string, callIndex: number): string {
  const before = source.slice(Math.max(0, callIndex - 400), callIndex);
  const stmtStart = Math.max(
    before.lastIndexOf(";"),
    before.lastIndexOf("{"),
    before.lastIndexOf("}"),
  );
  const stmt = before.slice(stmtStart + 1);
  const prefixes: string[] = [];
  for (const m of stmt.matchAll(/\.Group\s*\(/g)) {
    const lit = extractGoStringLiteral(stmt, m.index! + m[0].length);
    if (lit != null) prefixes.push(lit);
  }
  return prefixes.length ? joinPaths(...prefixes) : "";
}

export function getReceiverPrefix(
  source: string,
  callIndex: number,
  groupMap: Map<string, string>,
): string {
  const before = source.slice(Math.max(0, callIndex - 120), callIndex);
  // Receiver immediately before `.GET` / `.POST` etc.
  const simple = before.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  const receiver = simple?.[1];
  const fromVar = receiver ? groupMap.get(receiver) ?? "" : "";
  const inline = getInlineGroupChainPrefix(source, callIndex);
  if (fromVar && inline) {
    // Prefer variable map when receiver is a known group; inline may double-count
    return fromVar;
  }
  return fromVar || inline;
}

/**
 * Extract Chi `r.Route("/api", func(r chi.Router) { ... })` blocks with nested support.
 */
export function extractChiRouteBlocks(
  source: string,
): Array<{ prefix: string; body: string; bodyStart: number }> {
  const blocks: Array<{ prefix: string; body: string; bodyStart: number }> = [];
  const re = /\.Route\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const prefix = extractGoStringLiteral(source, openParen + 1);
    if (!prefix) continue;

    // Find func( ... ) { body }
    const afterPrefix = source.slice(openParen);
    const funcIdx = afterPrefix.search(/func\s*\(/);
    if (funcIdx < 0) continue;
    const braceIdx = afterPrefix.indexOf("{", funcIdx);
    if (braceIdx < 0) continue;
    const absBrace = openParen + braceIdx;
    const absEnd = findMatchingBraceEnd(source, absBrace);
    if (absEnd < 0) continue;
    const bodyStart = absBrace + 1;
    const body = source.slice(bodyStart, absEnd - 1);
    blocks.push({ prefix: normalizePath(prefix), body, bodyStart });
  }

  return blocks;
}

export function buildRawRoute(
  method: HttpMethod,
  path: string,
  sourceFile: string,
  relativePath: string,
  _source: string,
  lineNumber: number,
  handler?: string,
  prefix = "",
  enrichment?: Partial<HandlerEnrichment> & { folder?: string[] },
): RawRoute {
  const fullPath = joinPaths(prefix, path);
  const pathParams =
    enrichment?.pathParameters ?? extractPathParamsFromPattern(fullPath);

  return {
    method,
    path: fullPath,
    handler,
    summary: humanizeHandlerName(handler),
    tags: [],
    folder:
      enrichment?.folder && enrichment.folder.length > 0
        ? enrichment.folder
        : folderFromPathAndFile(fullPath, relativePath, prefix || undefined),
    sourceFile,
    lineNumber,
    pathParameters: pathParams,
    queryParameters: enrichment?.queryParameters ?? [],
    headers: enrichment?.headers ?? [],
    requestBody: enrichment?.requestBody,
    responses: [{ statusCode: 200 }],
    middleware: [],
    warnings: enrichment?.warnings ?? [],
  };
}

export interface NetHttpHandleCall {
  receiver: string;
  /** Method from Go 1.22 pattern, if present */
  method?: HttpMethod;
  path: string;
  handler?: string;
  handlerExpr: string;
  index: number;
  endIndex: number;
  isFileServer: boolean;
  isSkippedHandler: boolean;
  mount?: {
    stripPrefix?: string;
    childVar?: string;
    childRef?: string;
  };
  patternRaw: string;
}

/**
 * Parse Go 1.22+ ServeMux patterns: "GET /users/{id}", "/files/{path...}", "GET /{$}".
 */
export function parseGoServeMuxPattern(pattern: string): {
  method?: HttpMethod;
  path: string;
} {
  const trimmed = pattern.trim();
  const methodMatch = trimmed.match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S.*)$/i,
  );

  let method: HttpMethod | undefined;
  let pathPart = trimmed;

  if (methodMatch) {
    method = parseHttpMethod(methodMatch[1]) ?? undefined;
    pathPart = methodMatch[2].trim();
  }

  // Optional host prefix: "example.com/foo" — keep path portion after first /
  if (!pathPart.startsWith("/") && pathPart.includes("/")) {
    const slash = pathPart.indexOf("/");
    pathPart = pathPart.slice(slash);
  }

  if (pathPart === "/{$}" || pathPart === "{$}") {
    return { method, path: "/" };
  }

  return { method, path: normalizePath(pathPart) };
}

/**
 * Parse stdlib `http.HandleFunc` / `mux.Handle` registrations.
 */
export function parseNetHttpHandleCalls(source: string): NetHttpHandleCall[] {
  const results: NetHttpHandleCall[] = [];
  const re =
    /\b((?:[A-Za-z_][A-Za-z0-9_]*)\.)?(HandleFunc|Handle)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const receiver = match[1] ? match[1].slice(0, -1) : "http";
    // Skip if this looks like a type assertion / interface method name alone without call context
    // Require receiver to be identifier (http or mux var); skip empty
    if (!receiver) continue;

    const openParen = match.index + match[0].length - 1;
    const closeParen = findMatchingParenEnd(source, openParen);
    if (closeParen < 0) continue;
    const inner = source.slice(openParen + 1, closeParen - 1);
    const args = splitTopLevelArgs(inner);
    if (args.length < 2) continue;

    const patternRaw = extractGoStringLiteral(args[0], 0);
    if (patternRaw == null) continue;

    const parsed = parseGoServeMuxPattern(patternRaw);
    const handlerExpr = args[1].trim();
    const meta = classifyNetHttpHandlerArg(handlerExpr);

    results.push({
      receiver,
      method: parsed.method,
      path: parsed.path,
      handler: meta.handler,
      handlerExpr,
      index: match.index,
      endIndex: closeParen,
      isFileServer: meta.isFileServer,
      isSkippedHandler: meta.isSkippedHandler,
      mount: meta.mount,
      patternRaw,
    });
  }

  return results;
}

function classifyNetHttpHandlerArg(expr: string): {
  handler?: string;
  isFileServer: boolean;
  isSkippedHandler: boolean;
  mount?: NetHttpHandleCall["mount"];
} {
  const trimmed = expr.trim();

  if (/http\.FileServer\s*\(/.test(trimmed)) {
    return { isFileServer: true, isSkippedHandler: true };
  }
  if (/http\.(?:NotFoundHandler|RedirectHandler|TimeoutHandler)\s*\(/.test(trimmed)) {
    return { isFileServer: false, isSkippedHandler: true };
  }

  // http.StripPrefix("/api", child) or http.StripPrefix("/api", notes.Routes())
  const stripOpen = trimmed.match(/^http\.StripPrefix\s*\(/);
  if (stripOpen) {
    const openIdx = trimmed.indexOf("(");
    const closeIdx = findMatchingParenEnd(trimmed, openIdx);
    if (closeIdx > 0) {
      const stripInner = trimmed.slice(openIdx + 1, closeIdx - 1);
      const stripArgs = splitTopLevelArgs(stripInner);
      if (stripArgs.length >= 2) {
        const stripPrefix =
          extractGoStringLiteral(stripArgs[0], 0) ?? undefined;
        const child = stripArgs[1].trim();
        return {
          isFileServer: false,
          isSkippedHandler: false,
          mount: parseMountChild(child, stripPrefix),
        };
      }
    }
  }

  // Bare mux variable — may be a mount target
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return {
      handler: trimmed,
      isFileServer: false,
      isSkippedHandler: false,
      mount: { childVar: trimmed },
    };
  }

  // notes.Routes() / handlers.NewMux()
  const callMatch = trimmed.match(
    /^((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)$/,
  );
  if (callMatch) {
    return {
      isFileServer: false,
      isSkippedHandler: false,
      mount: { childRef: callMatch[1] },
    };
  }

  // Named handler: createUser / handlers.Create
  const nameMatch = trimmed.match(
    /^((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)$/,
  );
  if (nameMatch) {
    return {
      handler: nameMatch[1],
      isFileServer: false,
      isSkippedHandler: false,
    };
  }

  // Inline func — no named handler
  if (trimmed.startsWith("func")) {
    return { isFileServer: false, isSkippedHandler: false };
  }

  return { isFileServer: false, isSkippedHandler: false };
}

function parseMountChild(
  child: string,
  stripPrefix?: string,
): NetHttpHandleCall["mount"] {
  const trimmed = child.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return { stripPrefix, childVar: trimmed };
  }
  const callMatch = trimmed.match(
    /^((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)$/,
  );
  if (callMatch) {
    return { stripPrefix, childRef: callMatch[1] };
  }
  return { stripPrefix, childRef: trimmed };
}

/**
 * Infer HTTP methods from classic net/http handler bodies when the pattern
 * has no Go 1.22 method prefix. Defaults to GET.
 */
export function inferHttpMethodsFromHandlerBody(handlerBody: string): HttpMethod[] {
  const methods = new Set<HttpMethod>();

  for (const m of handlerBody.matchAll(/http\.Method(\w+)/g)) {
    const method = parseHttpMethod(m[1]);
    if (method) methods.add(method);
  }

  for (const m of handlerBody.matchAll(
    /(?:r\.Method|req\.Method)\s*(?:==|!=)\s*"([A-Za-z]+)"/g,
  )) {
    const method = parseHttpMethod(m[1]);
    if (method) methods.add(method);
  }

  for (const m of handlerBody.matchAll(/case\s+"([A-Za-z]+)"\s*:/g)) {
    const method = parseHttpMethod(m[1]);
    if (method) methods.add(method);
  }

  for (const m of handlerBody.matchAll(/case\s+http\.Method(\w+)\s*:/g)) {
    const method = parseHttpMethod(m[1]);
    if (method) methods.add(method);
  }

  if (methods.size === 0) return ["GET"];
  return [...methods];
}

export function findServeMuxVariables(source: string): Set<string> {
  const vars = new Set<string>();
  for (const m of source.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)\s*:?=\s*http\.NewServeMux\s*\(/g,
  )) {
    vars.add(m[1]);
  }
  return vars;
}

/**
 * Body ranges of functions that return http.Handler / *http.ServeMux —
 * their routes should only be emitted via mounts, not as top-level paths.
 */
export function findHandlerFactoryBodyRanges(
  source: string,
): Array<{ start: number; end: number; name: string }> {
  const ranges: Array<{ start: number; end: number; name: string }> = [];
  const re =
    /func\s+(?:\([^)]*\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*[^{]*?\*?http\.(?:Handler|ServeMux)\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1];
    const openBrace = match.index + match[0].length - 1;
    const end = findMatchingBraceEnd(source, openBrace);
    if (end < 0) continue;
    ranges.push({ start: openBrace + 1, end: end - 1, name });
  }
  return ranges;
}

export { lineNumberAtIndex, normalizePath, joinPaths };
