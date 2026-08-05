import type { ApiParameter, ApiRequestBody, HttpMethod } from "../../../models/endpoint";
import { extractPathParamsFromPattern, normalizePath } from "./path-utils";
import {
  findStructSchema,
  schemaToJsonRequestBody,
  type GoStructSchema,
} from "./schema-extractor";

export interface GoHandlerInfo {
  name: string;
  sourceFile: string;
  source: string;
  bodyStart: number;
  bodyEnd: number;
}

export interface HandlerEnrichment {
  requestBody?: ApiRequestBody;
  queryParameters: ApiParameter[];
  pathParameters: ApiParameter[];
  headers: ApiParameter[];
  warnings: string[];
}

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

const BIND_CALL_RE =
  /(?:ShouldBindJSON|BindJSON|MustBindWith|ShouldBindWith|ShouldBind|BindWith|Bind)\s*\(\s*&?\s*([A-Za-z_][A-Za-z0-9_]*)/g;

const DECODE_CALL_RE =
  /\.Decode\s*\(\s*&?\s*([A-Za-z_][A-Za-z0-9_]*)/g;

const UNMARSHAL_CALL_RE =
  /(?:json\.)?Unmarshal\s*\(\s*[^,]+,\s*&?\s*([A-Za-z_][A-Za-z0-9_]*)/g;

export function buildHandlerIndex(
  files: Array<{ source: string; sourceFile: string }>,
): Map<string, GoHandlerInfo> {
  const index = new Map<string, GoHandlerInfo>();
  for (const file of files) {
    for (const handler of extractHandlersFromSource(file.source, file.sourceFile)) {
      // Last definition wins; also index bare name for pkg.Handler lookups
      index.set(handler.name, handler);
    }
  }
  return index;
}

export function extractHandlersFromSource(
  source: string,
  sourceFile: string,
): GoHandlerInfo[] {
  const handlers: GoHandlerInfo[] = [];
  // func Name(...) | func (r *Receiver) Name(...)
  const fnRe =
    /func\s+(?:\([^)]*\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)[^{]*\{/g;

  let match: RegExpExecArray | null;
  while ((match = fnRe.exec(source)) !== null) {
    const name = match[1];
    const openBrace = match.index + match[0].length - 1;
    const bodyEnd = findMatchingBraceEnd(source, openBrace);
    if (bodyEnd < 0) continue;
    handlers.push({
      name,
      sourceFile,
      source,
      bodyStart: openBrace + 1,
      bodyEnd,
    });
  }
  return handlers;
}

function findMatchingBraceEnd(source: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Resolve Go types bound via Gin/Echo/Chi body helpers inside a handler.
 * Supports:
 *   var req CreateNote / var req models.CreateNote
 *   req := CreateNote{} / req := &CreateNote{} / req := new(CreateNote)
 *   if err := c.ShouldBindJSON(&req); err != nil
 *   c.Bind(&req) / json.NewDecoder(...).Decode(&req)
 *   json.Unmarshal(body, &req)
 */
export function extractBoundStructNames(handlerBody: string): string[] {
  const names: string[] = [];
  const bindTargets = new Set<string>();

  for (const m of handlerBody.matchAll(BIND_CALL_RE)) {
    bindTargets.add(m[1]);
  }
  for (const m of handlerBody.matchAll(DECODE_CALL_RE)) {
    bindTargets.add(m[1]);
  }
  for (const m of handlerBody.matchAll(UNMARSHAL_CALL_RE)) {
    bindTargets.add(m[1]);
  }

  // Direct: ShouldBindJSON(&CreateNote{}) — rare but support
  for (const m of handlerBody.matchAll(
    /(?:ShouldBindJSON|BindJSON|ShouldBind|Bind)\s*\(\s*&?\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\{/g,
  )) {
    names.push(stripPackage(m[1]));
  }

  for (const varName of bindTargets) {
    const resolved = resolveVarType(handlerBody, varName);
    if (resolved) names.push(resolved);
  }

  return [...new Set(names.filter(Boolean))];
}

function resolveVarType(handlerBody: string, varName: string): string | null {
  // var req CreateNote  /  var req *models.CreateNote
  const varDecl = handlerBody.match(
    new RegExp(
      `var\\s+${varName}\\s+(\\*?[A-Za-z_][A-Za-z0-9_.]*)`,
    ),
  );
  if (varDecl) return stripPackage(varDecl[1]);

  // req := CreateNote{  / req := &CreateNote{
  const shortDecl = handlerBody.match(
    new RegExp(
      `${varName}\\s*:?=\\s*&?\\s*([A-Za-z_][A-Za-z0-9_.]*)\\s*\\{`,
    ),
  );
  if (shortDecl) return stripPackage(shortDecl[1]);

  // req := new(CreateNote)
  const newDecl = handlerBody.match(
    new RegExp(
      `${varName}\\s*:?=\\s*new\\s*\\(\\s*([A-Za-z_][A-Za-z0-9_.]*)\\s*\\)`,
    ),
  );
  if (newDecl) return stripPackage(newDecl[1]);

  // var req = CreateNote{}
  const varAssign = handlerBody.match(
    new RegExp(
      `var\\s+${varName}\\s*=\\s*&?\\s*([A-Za-z_][A-Za-z0-9_.]*)\\s*\\{`,
    ),
  );
  if (varAssign) return stripPackage(varAssign[1]);

  // req = &CreateNote{} (reassignment)
  const reassign = handlerBody.match(
    new RegExp(
      `${varName}\\s*=\\s*&?\\s*([A-Za-z_][A-Za-z0-9_.]*)\\s*\\{`,
    ),
  );
  if (reassign) return stripPackage(reassign[1]);

  return null;
}

function stripPackage(typeName: string): string {
  const cleaned = typeName.replace(/^\*/, "");
  return cleaned.includes(".")
    ? cleaned.slice(cleaned.lastIndexOf(".") + 1)
    : cleaned;
}

export function enrichRouteFromHandler(
  method: HttpMethod,
  path: string,
  handlerName: string | undefined,
  handlers: Map<string, GoHandlerInfo>,
  schemas: Map<string, GoStructSchema>,
): HandlerEnrichment {
  const pathParameters = extractPathParamsFromPattern(normalizePath(path));
  const queryParameters: ApiParameter[] = [];
  const headers: ApiParameter[] = [];
  const warnings: string[] = [];
  let requestBody: ApiRequestBody | undefined;

  if (!handlerName) {
    return { pathParameters, queryParameters, headers, warnings };
  }

  const simpleName = handlerName.includes(".")
    ? handlerName.slice(handlerName.lastIndexOf(".") + 1)
    : handlerName;
  const handler = handlers.get(simpleName) ?? handlers.get(handlerName);
  if (!handler) {
    return { pathParameters, queryParameters, headers, warnings };
  }

  const body = handler.source.slice(handler.bodyStart, handler.bodyEnd);

  for (const m of body.matchAll(
    /(?:\.Query|\.QueryParam|\.FormValue|\.DefaultQuery|URL\.Query\(\)\.Get)\s*\(\s*"([^"]+)"\s*\)/g,
  )) {
    if (!queryParameters.some((q) => q.name === m[1])) {
      queryParameters.push({
        name: m[1],
        type: "string",
        required: false,
        in: "query",
        example: "",
      });
    }
  }

  // Path params from c.Param("id") / r.PathValue("id") when URL pattern missed them
  for (const m of body.matchAll(
    /(?:\.Param|URLParam|PathValue)\s*\(\s*(?:r,\s*)?"([^"]+)"\s*\)/g,
  )) {
    if (!pathParameters.some((p) => p.name === m[1])) {
      pathParameters.push({
        name: m[1],
        type: "string",
        required: true,
        in: "path",
        example: m[1] === "id" ? "1" : m[1],
      });
    }
  }

  for (const m of body.matchAll(/\.Header\.Get\s*\(\s*"([^"]+)"\s*\)/g)) {
    if (!headers.some((h) => h.name === m[1])) {
      headers.push({
        name: m[1],
        type: "string",
        required: false,
        in: "header",
        example: "",
      });
    }
  }

  if (BODY_METHODS.has(method) || method === "DELETE") {
    const structNames = extractBoundStructNames(body);
    for (const structName of structNames) {
      const schema = findStructSchema(schemas, structName);
      if (schema && schema.fields.length > 0) {
        requestBody = schemaToJsonRequestBody(schema);
        break;
      }
    }

    if (
      !requestBody &&
      BODY_METHODS.has(method) &&
      /ShouldBindJSON|BindJSON|ShouldBind\b|\.Bind\s*\(|\.Decode\s*\(|Unmarshal\s*\(/.test(
        body,
      )
    ) {
      requestBody = {
        contentType: "application/json",
        schema: {},
        example: "{}",
      };
      warnings.push("Found bind/decode but could not resolve request struct schema");
    }
  }

  return { requestBody, queryParameters, pathParameters, headers, warnings };
}
