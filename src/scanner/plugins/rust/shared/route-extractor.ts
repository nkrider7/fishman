import type { HttpMethod } from "../../../models/endpoint";
import type { PathPrefix, RawRoute } from "./types";
import {
  extractPathParamsFromPattern,
  folderFromFilePath,
  joinPaths,
  lineNumberAtIndex,
  normalizePath,
} from "./path-utils";
import { detectAuthFromSource } from "./auth-detector";

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

/** Extract a Rust string literal (supports raw strings r#"..."#). */
export function extractRustStringLiteral(source: string, startIndex: number): string | null {
  const slice = source.slice(startIndex).trimStart();
  if (slice.startsWith("r#")) {
    const rawMatch = slice.match(/^r#+"(.*?)"#+/s);
    return rawMatch?.[1] ?? null;
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
        else if (next === "r") value += "\r";
        else if (next === "\\") value += "\\";
        else if (next === '"') value += '"';
        else value += next ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') return value;
      value += ch;
      i++;
    }
    return null;
  }
  return null;
}

export function findStringAfterPattern(
  source: string,
  pattern: RegExp,
): Array<{ value: string; index: number }> {
  const results: Array<{ value: string; index: number }> = [];
  for (const match of source.matchAll(pattern)) {
    const after = match.index! + match[0].length;
    const literal = extractRustStringLiteral(source, after);
    if (literal != null) {
      results.push({ value: literal, index: match.index! });
    }
  }
  return results;
}

/** Track nested scope/nest/resource blocks by brace depth. */
export function extractPathPrefixes(
  source: string,
  patterns: RegExp[],
  kind: PathPrefix["kind"],
): PathPrefix[] {
  const prefixes: PathPrefix[] = [];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const startIndex = match.index!;
      const literal = extractRustStringLiteral(source, startIndex + match[0].length);
      if (literal == null) continue;

      const startLine = lineNumberAtIndex(source, startIndex);
      const endLine = findBlockEndLine(source, startIndex);
      prefixes.push({
        prefix: normalizePath(literal),
        startLine,
        endLine,
        kind,
      });
    }
  }

  return prefixes;
}

function findBlockEndLine(source: string, startIndex: number): number {
  let depth = 0;
  let started = false;
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") {
      depth++;
      started = true;
    } else if (ch === "}") {
      depth--;
      if (started && depth === 0) {
        return lineNumberAtIndex(source, i);
      }
    }
  }
  return lineNumberAtIndex(source, source.length - 1);
}

export function resolvePrefixForLine(
  prefixes: PathPrefix[],
  lineNumber: number,
): string {
  const applicable = prefixes
    .filter((p) => lineNumber >= p.startLine && lineNumber <= p.endLine)
    .sort((a, b) => {
      const depthA = a.endLine - a.startLine;
      const depthB = b.endLine - b.startLine;
      return depthA - depthB;
    });

  if (applicable.length === 0) return "";
  return applicable.map((p) => p.prefix).join("/").replace(/\/{2,}/g, "/");
}

/** Find the nearest enclosing Actix `scope("/prefix")` still open at `index`. */
export function findEnclosingScopePrefix(source: string, index: number): string {
  const scopes: Array<{ prefix: string; afterCall: number }> = [];

  for (const match of source.slice(0, index).matchAll(/(?:web::)?scope\s*\(/g)) {
    const callStart = match.index!;
    const literal = extractRustStringLiteral(source, callStart + match[0].length);
    if (!literal) continue;
    const afterCall = findMatchingParenEnd(source, callStart + match[0].length - 1);
    if (afterCall < 0 || afterCall > index) continue;
    scopes.push({ prefix: normalizePath(literal), afterCall });
  }

  for (let i = scopes.length - 1; i >= 0; i--) {
    const { prefix, afterCall } = scopes[i];
    let depth = 0;
    let enclosed = true;
    for (let j = afterCall; j < index; j++) {
      const ch = source[j];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth < 0) {
          enclosed = false;
          break;
        }
      } else if (depth === 0 && ch === ";") {
        enclosed = false;
        break;
      }
    }
    if (enclosed) return prefix;
  }

  return "";
}

function findMatchingParenEnd(source: string, openParenIndex: number): number {
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

/** Resolve scope/nest prefixes from the same method chain (excludes resource paths). */
export function resolveChainScopePrefixes(source: string, routeIndex: number): string {
  const enclosing = findEnclosingScopePrefix(source, routeIndex);
  if (enclosing) return enclosing;

  const chainStart = findChainStart(source, routeIndex);
  const chainSlice = source.slice(chainStart, routeIndex);
  const prefixes: string[] = [];

  const patterns = [
    /(?:web::)?scope\s*\(/g,
    /\.nest\s*\(/g,
    /\.merge\s*\(/g,
  ];

  for (const pattern of patterns) {
    for (const match of chainSlice.matchAll(pattern)) {
      const absIndex = chainStart + match.index! + match[0].length;
      const literal = extractRustStringLiteral(source, absIndex);
      if (literal) prefixes.push(normalizePath(literal));
    }
  }

  return prefixes.join("/").replace(/\/{2,}/g, "/");
}

/** Resolve scope/nest/resource prefixes from the same method chain as a route call. */
export function resolveChainPrefixes(source: string, routeIndex: number): string {
  const chainStart = findChainStart(source, routeIndex);
  const chainSlice = source.slice(chainStart, routeIndex);
  const prefixes: string[] = [];

  const patterns = [
    /(?:web::)?scope\s*\(/g,
    /(?:web::)?resource\s*\(/g,
    /\.nest\s*\(/g,
    /\.merge\s*\(/g,
  ];

  for (const pattern of patterns) {
    for (const match of chainSlice.matchAll(pattern)) {
      const absIndex = chainStart + match.index! + match[0].length;
      const literal = extractRustStringLiteral(source, absIndex);
      if (literal) prefixes.push(normalizePath(literal));
    }
  }

  return prefixes.join("/").replace(/\/{2,}/g, "/");
}

function findChainStart(source: string, index: number): number {
  let parenDepth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const ch = source[i];
    if (ch === ")") parenDepth++;
    else if (ch === "(") {
      parenDepth--;
      if (parenDepth < 0) return i + 1;
    } else if (parenDepth === 0 && ch === ";") {
      return i + 1;
    } else if (parenDepth === 0 && ch === "{") {
      return i + 1;
    }
  }
  return 0;
}

export interface NestFunctionMapping {
  prefix: string;
  /** Simple fn name or module path like notes::routes */
  functionRef: string;
  /** Last segment used to find fn body */
  functionName: string;
  /** Module path prefix without fn, e.g. "notes" or "api::notes" */
  modulePath?: string;
}

/** Map `.nest("/api", api_routes())` and `.nest("/api", notes::routes())`. */
export function extractNestFunctionMappings(source: string): NestFunctionMapping[] {
  const mappings: NestFunctionMapping[] = [];

  for (const match of source.matchAll(/\.nest\s*\(/g)) {
    const start = match.index! + match[0].length;
    const prefix = extractRustStringLiteral(source, start);
    if (!prefix) continue;

    const afterPrefix = source.slice(start);
    const commaIndex = afterPrefix.indexOf(",");
    if (commaIndex < 0) continue;

    const fnSlice = afterPrefix.slice(commaIndex + 1);
    // notes::routes()  /  crate::notes::router()  /  api_routes()
    const fnMatch = fnSlice.match(
      /^\s*((?:[A-Za-z_][A-Za-z0-9_]*::)*)([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    );
    if (fnMatch) {
      const modulePath = fnMatch[1].replace(/::$/, "") || undefined;
      const functionName = fnMatch[2];
      const functionRef = modulePath ? `${modulePath}::${functionName}` : functionName;
      mappings.push({
        prefix: normalizePath(prefix),
        functionRef,
        functionName,
        modulePath,
      });
    }
  }

  return mappings;
}

/** Map `.merge(notes::routes())` style calls (prefix empty — child paths stand alone). */
export function extractMergeFunctionMappings(source: string): NestFunctionMapping[] {
  const mappings: NestFunctionMapping[] = [];
  for (const match of source.matchAll(/\.merge\s*\(/g)) {
    const start = match.index! + match[0].length;
    const fnSlice = source.slice(start);
    const fnMatch = fnSlice.match(
      /^\s*((?:[A-Za-z_][A-Za-z0-9_]*::)*)([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
    );
    if (fnMatch) {
      const modulePath = fnMatch[1].replace(/::$/, "") || undefined;
      const functionName = fnMatch[2];
      const functionRef = modulePath ? `${modulePath}::${functionName}` : functionName;
      mappings.push({
        prefix: "",
        functionRef,
        functionName,
        modulePath,
      });
    }
  }
  return mappings;
}

export interface BoundRouteMethod {
  method: HttpMethod;
  handler?: string;
}

/**
 * Parse ONLY the method-chain argument of `.route("path", METHOD_CHAIN)`.
 * Returns path + bounded methods so later routes cannot leak methods in.
 */
export function parseAxumRouteCall(
  source: string,
  routeCallIndex: number,
): { path: string; methods: BoundRouteMethod[]; endIndex: number } | null {
  const afterRoute = source.slice(routeCallIndex);
  const openMatch = afterRoute.match(/^\.route\s*\(/);
  if (!openMatch) return null;

  const openParen = routeCallIndex + openMatch[0].length - 1;
  const closeParen = findMatchingParenEnd(source, openParen);
  if (closeParen < 0) return null;

  // findMatchingParenEnd returns index after `)`
  const inner = source.slice(openParen + 1, closeParen - 1);
  const path = extractRustStringLiteral(inner, 0);
  if (path == null) return null;

  // Find comma after path string
  let i = 0;
  // skip whitespace then string
  while (i < inner.length && /\s/.test(inner[i])) i++;
  if (inner[i] === "r" && inner[i + 1] === "#") {
    const raw = inner.slice(i).match(/^r#*"[^"]*"#*/);
    i += raw?.[0].length ?? 0;
  } else if (inner[i] === '"') {
    i++;
    while (i < inner.length) {
      if (inner[i] === "\\") {
        i += 2;
        continue;
      }
      if (inner[i] === '"') {
        i++;
        break;
      }
      i++;
    }
  }
  while (i < inner.length && /\s/.test(inner[i])) i++;
  if (inner[i] !== ",") return { path, methods: [], endIndex: closeParen };
  const methodChain = inner.slice(i + 1).trim();
  const methods = parseAxumMethodChain(methodChain);
  return { path, methods, endIndex: closeParen };
}

export function parseAxumMethodChain(chain: string): BoundRouteMethod[] {
  const methods: BoundRouteMethod[] = [];
  // get(handler).post(handler2)  or  routing::get(handler)
  const re =
    /(?:^|\.)(?:(?:routing|axum::routing)::)?(get|post|put|patch|delete|head|options|trace|connect|query)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chain)) !== null) {
    const httpMethod = axumMethodFromCall(match[1]);
    if (!httpMethod) continue;
    const after = match.index + match[0].length;
    const handler = extractHandlerFromCallArgs(chain, after - 1);
    methods.push({ method: httpMethod, handler });
  }
  return methods;
}

function extractHandlerFromCallArgs(source: string, openParenIndex: number): string | undefined {
  // openParenIndex points at '('
  const close = findMatchingParenEnd(source, openParenIndex);
  if (close < 0) return undefined;
  const inner = source.slice(openParenIndex + 1, close - 1).trim();
  // handler  /  module::handler  /  || async { }  /  handlers::create
  if (!inner || inner.startsWith("|")) return undefined;
  const nameMatch = inner.match(/^((?:[A-Za-z_][A-Za-z0-9_]*::)*[A-Za-z_][A-Za-z0-9_]*)/);
  return nameMatch?.[1];
}

/**
 * Parse Actix `.route("/path", web::get().to(handler))` with bounded args.
 */
export function parseActixRouteCall(
  source: string,
  routeCallIndex: number,
): { path: string; methods: BoundRouteMethod[]; endIndex: number } | null {
  const afterRoute = source.slice(routeCallIndex);
  const openMatch = afterRoute.match(/^\.route\s*\(/);
  if (!openMatch) return null;

  const openParen = routeCallIndex + openMatch[0].length - 1;
  const closeParen = findMatchingParenEnd(source, openParen);
  if (closeParen < 0) return null;

  const inner = source.slice(openParen + 1, closeParen - 1);
  // Case A: .route("/path", web::get().to(h))
  const path = extractRustStringLiteral(inner, 0);
  if (path != null) {
    const methods: BoundRouteMethod[] = [];
    for (const m of inner.matchAll(
      /(?:web::)?(get|post|put|patch|delete|head|options|trace|connect|query)\s*\(\s*\)/g,
    )) {
      const httpMethod = actixMethodFromWebCall(m[1]);
      if (!httpMethod) continue;
      const handler = extractHandlerName(inner, m.index! + m[0].length);
      methods.push({ method: httpMethod, handler });
    }
    return { path, methods, endIndex: closeParen };
  }

  // Case B: .route(web::get().to(h))  — used on resource()
  const methods: BoundRouteMethod[] = [];
  for (const m of inner.matchAll(
    /(?:web::)?(get|post|put|patch|delete|head|options|trace|connect|query)\s*\(\s*\)/g,
  )) {
    const httpMethod = actixMethodFromWebCall(m[1]);
    if (!httpMethod) continue;
    const handler = extractHandlerName(inner, m.index! + m[0].length);
    methods.push({ method: httpMethod, handler });
  }
  if (methods.length === 0) return null;
  return { path: "/", methods, endIndex: closeParen };
}

export function folderFromPathAndFile(
  fullPath: string,
  relativePath: string,
  nestPrefix?: string,
): string[] {
  const pathParts = fullPath
    .replace(/\{[^}]+\}/g, "")
    .split("/")
    .filter(Boolean);

  if (nestPrefix) {
    const nestParts = nestPrefix.split("/").filter(Boolean);
    if (nestParts.length > 0) {
      // Prefer resource segment after nest: /api/notes -> notes, or api/notes
      const afterNest = pathParts.slice(nestParts.length);
      if (afterNest.length > 0) return [afterNest[0]];
      return [nestParts[nestParts.length - 1]];
    }
  }

  if (pathParts.length >= 2) {
    // /api/notes -> notes ; /api/healthcheck -> healthcheck
    return [pathParts[pathParts.length - 1] === "" ? pathParts[0] : pathParts[pathParts.length - 1]];
  }
  if (pathParts.length === 1) return [pathParts[0]];

  return folderFromFilePath(relativePath);
}

export function humanizeHandlerName(name?: string): string | undefined {
  if (!name) return undefined;
  const simple = name.includes("::") ? name.slice(name.lastIndexOf("::") + 2) : name;
  return simple
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** Extract the body slice of `fn name(...) { ... }` or `fn name(...) -> T { ... }`. */
export function extractFunctionBody(
  source: string,
  functionName: string,
): { body: string; bodyStart: number } | null {
  const fnPattern = new RegExp(
    `\\bfn\\s+${functionName}\\s*\\([^)]*\\)(?:\\s*->\\s*[^{]+)?\\s*\\{`,
  );
  const match = fnPattern.exec(source);
  if (!match) return null;

  const bodyStart = match.index! + match[0].length;
  let depth = 1;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return { body: source.slice(bodyStart, i), bodyStart };
    }
  }
  return null;
}

export function combinedPrefix(...parts: Array<string | undefined | null>): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .join("/")
    .replace(/\/{2,}/g, "/");
}

export function buildRawRoute(
  method: HttpMethod,
  path: string,
  sourceFile: string,
  relativePath: string,
  source: string,
  lineNumber: number,
  handler?: string,
  prefix = "",
  options?: {
    folder?: string[];
    requestBody?: RawRoute["requestBody"];
    queryParameters?: RawRoute["queryParameters"];
    pathParameters?: RawRoute["pathParameters"];
    headers?: RawRoute["headers"];
    warnings?: string[];
    summary?: string;
  },
): RawRoute {
  const fullPath = joinPaths(prefix, path);
  const pathParams =
    options?.pathParameters ?? extractPathParamsFromPattern(fullPath);
  const auth = detectAuthFromSource(source, lineNumber, lineNumber);
  const folder =
    options?.folder && options.folder.length > 0
      ? options.folder
      : folderFromPathAndFile(fullPath, relativePath, prefix || undefined);

  return {
    method,
    path: fullPath,
    handler,
    summary: options?.summary ?? humanizeHandlerName(handler),
    tags: [],
    folder,
    sourceFile,
    lineNumber,
    pathParameters: pathParams,
    queryParameters: options?.queryParameters ?? [],
    headers: options?.headers ?? [],
    requestBody: options?.requestBody,
    authentication: auth.authentication,
    responses: [{ statusCode: 200 }],
    middleware: auth.middleware,
    warnings: options?.warnings ?? [],
  };
}

export function parseHttpMethod(value: string): HttpMethod | null {
  const upper = value.toUpperCase();
  return HTTP_METHODS.has(upper) ? (upper as HttpMethod) : null;
}

export function actixMethodFromWebCall(methodCall: string): HttpMethod | null {
  const map: Record<string, HttpMethod> = {
    get: "GET",
    post: "POST",
    put: "PUT",
    patch: "PATCH",
    delete: "DELETE",
    head: "HEAD",
    options: "OPTIONS",
    trace: "TRACE",
    connect: "CONNECT",
    query: "QUERY",
  };
  const key = methodCall.replace(/^web::/, "").toLowerCase();
  return map[key] ?? null;
}

export function axumMethodFromCall(methodCall: string): HttpMethod | null {
  const map: Record<string, HttpMethod> = {
    get: "GET",
    post: "POST",
    put: "PUT",
    patch: "PATCH",
    delete: "DELETE",
    head: "HEAD",
    options: "OPTIONS",
    trace: "TRACE",
    connect: "CONNECT",
    query: "QUERY",
  };
  const key = methodCall.toLowerCase();
  return map[key] ?? null;
}

export function extractHandlerName(source: string, afterIndex: number): string | undefined {
  const slice = source.slice(afterIndex);
  const toMatch = slice.match(/\.to\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (toMatch) return toMatch[1];
  const fnMatch = slice.match(/^\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/);
  return fnMatch?.[1];
}
