import type { ApiParameter, ApiRequestBody, HttpMethod } from "../../../models/endpoint";
import {
  extractPathParamsFromPattern,
  normalizePath,
} from "./path-utils";
import {
  findStructSchema,
  schemaToFormRequestBody,
  schemaToJsonRequestBody,
  type RustStructSchema,
} from "./schema-extractor";

export interface HandlerSignature {
  name: string;
  sourceFile: string;
  params: HandlerParam[];
  startIndex: number;
}

export interface HandlerParam {
  name: string;
  type: string;
}

export interface HandlerEnrichment {
  requestBody?: ApiRequestBody;
  queryParameters: ApiParameter[];
  pathParameters: ApiParameter[];
  headers: ApiParameter[];
  warnings: string[];
}

/** Index handler fn signatures by simple name (last wins if duplicates). */
export function buildHandlerIndex(
  files: Array<{ source: string; sourceFile: string }>,
): Map<string, HandlerSignature> {
  const index = new Map<string, HandlerSignature>();
  for (const file of files) {
    for (const handler of extractHandlersFromSource(file.source, file.sourceFile)) {
      index.set(handler.name, handler);
      // Also allow module-qualified lookup later via basename
    }
  }
  return index;
}

export function extractHandlersFromSource(
  source: string,
  sourceFile: string,
): HandlerSignature[] {
  const handlers: HandlerSignature[] = [];
  // Match async/sync fn with params; stop before `{` or `where` or `->`
  const fnRe =
    /(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = fnRe.exec(source)) !== null) {
    const name = match[1];
    const paramsStart = match.index + match[0].length - 1;
    const paramsEnd = findMatchingParen(source, paramsStart);
    if (paramsEnd < 0) continue;
    const paramsRaw = source.slice(paramsStart + 1, paramsEnd);
    const params = parseFnParams(paramsRaw);
    handlers.push({
      name,
      sourceFile,
      params,
      startIndex: match.index,
    });
  }
  return handlers;
}

function parseFnParams(raw: string): HandlerParam[] {
  const params: HandlerParam[] = [];
  for (const part of splitTopLevel(raw)) {
    const cleaned = part.trim();
    if (
      !cleaned ||
      cleaned === "self" ||
      cleaned.startsWith("&self") ||
      cleaned.startsWith("&mut self")
    ) {
      continue;
    }

    // Patterns:
    // Json(payload): Json<CreateNote>
    // Path(id): Path<i64>
    // (Path(id), Json(body)): ...  — rare, skip
    // payload: Json<CreateNote>
    // id: Path<Uuid>
    const typed = cleaned.match(/^(.+?)\s*:\s*(.+)$/s);
    if (!typed) continue;

    const left = typed[1].trim();
    const type = typed[2].trim();

    // Extractor pattern binding: Json(payload) / Path((a, b))
    const extractorBind = left.match(/^([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\s*\(/);
    const name = extractorBind
      ? left.match(/\(([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? extractorBind[1]
      : left.replace(/^mut\s+/, "").trim();

    params.push({ name: name || "param", type });
  }
  return params;
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depthAngle = 0;
  let depthParen = 0;
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "<") depthAngle++;
    else if (ch === ">") depthAngle = Math.max(0, depthAngle - 1);
    else if (ch === "(") depthParen++;
    else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
    else if (ch === "," && depthAngle === 0 && depthParen === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Extract inner type from wrappers like Json<T>, axum::extract::Json<T>, web::Json<T>. */
export function unwrapExtractorType(
  type: string,
): { kind: "json" | "form" | "path" | "query" | "state" | "other"; inner?: string } {
  const cleaned = type.replace(/\s+/g, " ").trim();

  const wrappers: Array<{ kind: "json" | "form" | "path" | "query" | "state"; re: RegExp }> = [
    { kind: "json", re: /(?:^|::)Json\s*<\s*(.+)\s*>$/ },
    { kind: "form", re: /(?:^|::)Form\s*<\s*(.+)\s*>$/ },
    { kind: "path", re: /(?:^|::)Path\s*<\s*(.+)\s*>$/ },
    { kind: "query", re: /(?:^|::)Query\s*<\s*(.+)\s*>$/ },
    { kind: "state", re: /(?:^|::)State\s*<\s*(.+)\s*>$/ },
  ];

  for (const w of wrappers) {
    const m = cleaned.match(w.re);
    if (m) return { kind: w.kind, inner: m[1].trim() };
  }
  return { kind: "other" };
}

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function enrichRouteFromHandler(
  method: HttpMethod,
  path: string,
  handlerName: string | undefined,
  handlers: Map<string, HandlerSignature>,
  schemas: Map<string, RustStructSchema>,
): HandlerEnrichment {
  const pathParameters = extractPathParamsFromPattern(normalizePath(path));
  const queryParameters: ApiParameter[] = [];
  const headers: ApiParameter[] = [];
  const warnings: string[] = [];
  let requestBody: ApiRequestBody | undefined;

  if (!handlerName) {
    return { pathParameters, queryParameters, headers, warnings };
  }

  // Resolve bare name or last segment of path::to::handler
  const simpleName = handlerName.includes("::")
    ? handlerName.slice(handlerName.lastIndexOf("::") + 2)
    : handlerName;
  const handler = handlers.get(simpleName) ?? handlers.get(handlerName);
  if (!handler) {
    return { pathParameters, queryParameters, headers, warnings };
  }

  for (const param of handler.params) {
    const extracted = unwrapExtractorType(param.type);

    if (extracted.kind === "json" && extracted.inner) {
      if (BODY_METHODS.has(method) || method === "DELETE") {
        const schema = findStructSchema(schemas, extracted.inner);
        if (schema) {
          requestBody = schemaToJsonRequestBody(schema);
        } else if (BODY_METHODS.has(method)) {
          requestBody = {
            contentType: "application/json",
            schema: {},
            example: "{}",
          };
          warnings.push(`Could not resolve Json<${extracted.inner}> schema`);
        }
      }
      continue;
    }

    if (extracted.kind === "form" && extracted.inner) {
      if (BODY_METHODS.has(method)) {
        const schema = findStructSchema(schemas, extracted.inner);
        if (schema) {
          requestBody = schemaToFormRequestBody(schema);
        }
      }
      continue;
    }

    if (extracted.kind === "query" && extracted.inner) {
      const schema = findStructSchema(schemas, extracted.inner);
      if (schema) {
        for (const field of schema.fields) {
          queryParameters.push({
            name: field.name,
            type: field.type,
            required: field.required,
            in: "query",
            example: field.name === "id" ? "1" : "",
          });
        }
      }
      continue;
    }

    if (extracted.kind === "path" && extracted.inner) {
      // Path already from URL pattern; enrich names if Path<(id,)> style or single type
      if (pathParameters.length === 0) {
        const inner = extracted.inner;
        if (/^\([^)]+\)$/.test(inner) || inner.includes(",")) {
          const names = inner
            .replace(/^\(|\)$/g, "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          for (const n of names) {
            const name = n.replace(/^mut\s+/, "").split(/\s+/).pop() ?? n;
            if (/^[A-Za-z_]/.test(name) && !/^(i\d+|u\d+|String|Uuid|bool)$/.test(name)) {
              pathParameters.push({
                name,
                type: "string",
                required: true,
                in: "path",
                example: name === "id" ? "1" : name,
              });
            }
          }
        } else if (!/^(i\d+|u\d+|String|Uuid|bool|usize|isize)$/.test(inner)) {
          // Path<NoteId> etc. — keep path params from URL
        }
      }
      continue;
    }
  }

  return { requestBody, queryParameters, pathParameters, headers, warnings };
}
