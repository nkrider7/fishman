import type {
  ApiAuthentication,
  ApiEndpoint,
  ApiParameter,
  ApiRequestBody,
} from "@/scanner/models/endpoint";
import type { HttpMethod } from "@/types/request";
import { generateId } from "@/utils/id";
import { normalizePath } from "@/scan-drift/normalize";
import { detectSpecFormat } from "./parse";
import { dereferenceLocal } from "./dereference";
import type { ParsedSpecDocument, SpecParseResult } from "./types";

const SUPPORTED_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

const EXAMPLE_BODY_CAP = 64 * 1024;

export function parseOpenApiToEndpoints(
  doc: Record<string, unknown>,
  options?: { sourceLabel?: string },
): SpecParseResult {
  const warnings: string[] = [];
  const { format, version } = detectSpecFormat(doc);
  if (format === "unknown") {
    throw new Error(
      "Not a valid OpenAPI or Swagger document (missing openapi/swagger version).",
    );
  }

  const deref = dereferenceLocal(doc, warnings);
  const info = (deref.info as Record<string, unknown> | undefined) ?? {};
  const title =
    typeof info.title === "string" && info.title.trim()
      ? info.title.trim()
      : "OpenAPI Collection";

  const baseUrl = extractBaseUrl(deref, format);
  const document: ParsedSpecDocument = {
    format,
    version,
    title,
    baseUrl,
    raw: deref,
    warnings: [...warnings],
  };

  const paths = deref.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    throw new Error("Spec is missing a paths object.");
  }

  const sourceLabel = options?.sourceLabel ?? "openapi";
  const endpoints: ApiEndpoint[] = [];

  for (const [rawPath, pathItem] of Object.entries(
    paths as Record<string, unknown>,
  )) {
    if (!pathItem || typeof pathItem !== "object" || Array.isArray(pathItem)) {
      continue;
    }
    const pathObj = pathItem as Record<string, unknown>;
    const pathParams = asParamArray(pathObj.parameters);

    for (const [methodKey, operation] of Object.entries(pathObj)) {
      if (
        methodKey === "parameters" ||
        methodKey === "$ref" ||
        methodKey === "summary" ||
        methodKey === "description"
      ) {
        continue;
      }
      if (!SUPPORTED_METHODS.has(methodKey.toLowerCase())) continue;
      if (
        !operation ||
        typeof operation !== "object" ||
        Array.isArray(operation)
      ) {
        continue;
      }

      const op = operation as Record<string, unknown>;
      const method = methodKey.toUpperCase() as HttpMethod;
      const path = normalizePath(rawPath);
      const opParams = asParamArray(op.parameters);
      const mergedParams = [...pathParams, ...opParams];

      const queryParameters: ApiParameter[] = [];
      const pathParameters: ApiParameter[] = [];
      const headers: ApiParameter[] = [];

      for (const param of mergedParams) {
        const mapped = mapParameter(param, warnings);
        if (!mapped) continue;
        if (mapped.in === "query") queryParameters.push(mapped);
        else if (mapped.in === "path") pathParameters.push(mapped);
        else if (mapped.in === "header") headers.push(mapped);
      }

      const tags = Array.isArray(op.tags)
        ? op.tags.filter(
            (t): t is string => typeof t === "string" && t.trim().length > 0,
          )
        : [];
      const folder = tags.length > 0 ? [tags[0]] : ["Default"];

      const name = pickOperationName(op, method, path);
      const description =
        typeof op.description === "string"
          ? op.description
          : typeof op.summary === "string"
            ? op.summary
            : undefined;

      const requestBody = mapRequestBody(op, format, warnings);
      const authentication = mapSecurity(op, deref, format);

      endpoints.push({
        id: generateId(),
        name,
        method,
        path,
        description,
        tags,
        folder,
        headers,
        authentication,
        queryParameters,
        pathParameters,
        requestBody,
        responses: [],
        middleware: [],
        sourceFile: sourceLabel,
        handler:
          typeof op.operationId === "string" ? op.operationId : undefined,
        framework: format === "swagger" ? "swagger" : "openapi",
        warnings: [],
      });
    }
  }

  if (endpoints.length === 0) {
    warnings.push("No HTTP operations found under paths.");
  }

  return { document, endpoints, warnings };
}

function extractBaseUrl(
  doc: Record<string, unknown>,
  format: "openapi" | "swagger" | "unknown",
): string | undefined {
  if (format === "openapi") {
    const servers = doc.servers;
    if (Array.isArray(servers) && servers.length > 0) {
      const first = servers[0] as { url?: string };
      if (typeof first?.url === "string" && first.url.trim()) {
        return first.url.trim().replace(/\/$/, "");
      }
    }
    return undefined;
  }

  if (format === "swagger") {
    const host = typeof doc.host === "string" ? doc.host.trim() : "";
    const basePath =
      typeof doc.basePath === "string" ? doc.basePath.trim() : "";
    const schemes = Array.isArray(doc.schemes)
      ? (doc.schemes as unknown[]).filter(
          (s): s is string => typeof s === "string",
        )
      : [];
    const scheme = schemes.includes("https")
      ? "https"
      : (schemes[0] ?? "https");
    if (!host) return undefined;
    const path =
      basePath && basePath !== "/" ? basePath.replace(/\/$/, "") : "";
    return `${scheme}://${host}${path}`;
  }
  return undefined;
}

function asParamArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is Record<string, unknown> =>
      !!p && typeof p === "object" && !Array.isArray(p),
  );
}

function mapParameter(
  param: Record<string, unknown>,
  warnings: string[],
): ApiParameter | null {
  if (typeof param.$ref === "string") {
    warnings.push(`Unresolved parameter $ref: ${param.$ref}`);
    return null;
  }
  const name = typeof param.name === "string" ? param.name : "";
  if (!name) return null;
  const location = typeof param.in === "string" ? param.in : "query";
  if (
    location !== "query" &&
    location !== "path" &&
    location !== "header" &&
    location !== "cookie"
  ) {
    return null;
  }

  const schema = (param.schema as Record<string, unknown> | undefined) ?? {};
  const example =
    param.example ??
    schema.example ??
    param.default ??
    schema.default ??
    (location === "path" ? `{${name}}` : "");

  return {
    name,
    in: location,
    required: Boolean(param.required) || location === "path",
    description:
      typeof param.description === "string" ? param.description : undefined,
    type:
      typeof schema.type === "string"
        ? schema.type
        : typeof param.type === "string"
          ? param.type
          : undefined,
    example:
      typeof example === "string" ||
      typeof example === "number" ||
      typeof example === "boolean"
        ? example
        : example != null
          ? JSON.stringify(example)
          : undefined,
  };
}

function mapRequestBody(
  op: Record<string, unknown>,
  format: "openapi" | "swagger" | "unknown",
  warnings: string[],
): ApiRequestBody | undefined {
  if (
    format === "openapi" &&
    op.requestBody &&
    typeof op.requestBody === "object"
  ) {
    const body = op.requestBody as Record<string, unknown>;
    const content = (body.content as Record<string, unknown> | undefined) ?? {};
    const preferred =
      (content["application/json"] as Record<string, unknown> | undefined) ??
      (content["application/x-www-form-urlencoded"] as
        | Record<string, unknown>
        | undefined) ??
      (content["multipart/form-data"] as Record<string, unknown> | undefined) ??
      (Object.values(content)[0] as Record<string, unknown> | undefined);

    if (!preferred) return undefined;

    const contentType = content["application/json"]
      ? "application/json"
      : content["application/x-www-form-urlencoded"]
        ? "application/x-www-form-urlencoded"
        : content["multipart/form-data"]
          ? "multipart/form-data"
          : (Object.keys(content)[0] ?? "application/json");

    const example = extractExample(preferred, warnings);
    return {
      contentType,
      schema: preferred.schema as Record<string, unknown> | undefined,
      example,
      raw: example,
    };
  }

  const params = asParamArray(op.parameters);
  const bodyParam = params.find((p) => p.in === "body");
  if (bodyParam) {
    const schema =
      (bodyParam.schema as Record<string, unknown> | undefined) ?? {};
    const example = schemaExample(schema);
    return {
      contentType: "application/json",
      schema,
      example,
      raw: example,
    };
  }
  const formParams = params.filter((p) => p.in === "formData");
  if (formParams.length > 0) {
    const isMultipart = formParams.some((p) => p.type === "file");
    const pairs = formParams.map((p) => {
      const name = String(p.name ?? "");
      const value = p.default ?? p.example ?? "";
      return `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`;
    });
    return {
      contentType: isMultipart
        ? "multipart/form-data"
        : "application/x-www-form-urlencoded",
      example: pairs.join("&"),
      raw: pairs.join("&"),
    };
  }
  return undefined;
}

function extractExample(
  media: Record<string, unknown>,
  _warnings: string[],
): string | undefined {
  if (media.example != null) {
    return stringifyExample(media.example);
  }
  if (media.examples && typeof media.examples === "object") {
    const first = Object.values(
      media.examples as Record<string, unknown>,
    )[0] as { value?: unknown } | undefined;
    if (first?.value != null) return stringifyExample(first.value);
  }
  if (media.schema && typeof media.schema === "object") {
    return schemaExample(media.schema as Record<string, unknown>);
  }
  return undefined;
}

function schemaExample(schema: Record<string, unknown>): string | undefined {
  if (schema.example != null) return stringifyExample(schema.example);
  if (schema.default != null) return stringifyExample(schema.default);

  const type = schema.type;
  if (type === "object" || schema.properties) {
    const props = (schema.properties as Record<string, unknown>) ?? {};
    const required = Array.isArray(schema.required)
      ? (schema.required as string[])
      : Object.keys(props);
    const obj: Record<string, unknown> = {};
    for (const key of required.slice(0, 20)) {
      const prop = props[key];
      if (prop && typeof prop === "object") {
        const nested = schemaExample(prop as Record<string, unknown>);
        try {
          obj[key] = nested ? JSON.parse(nested) : "string";
        } catch {
          obj[key] = nested ?? "string";
        }
      } else {
        obj[key] = "string";
      }
    }
    return stringifyExample(obj);
  }
  if (type === "array") {
    const items = (schema.items as Record<string, unknown>) ?? {};
    const itemEx = schemaExample(items);
    try {
      return stringifyExample([itemEx ? JSON.parse(itemEx) : "string"]);
    } catch {
      return stringifyExample([itemEx ?? "string"]);
    }
  }
  if (type === "integer" || type === "number") return "0";
  if (type === "boolean") return "false";
  if (type === "string") return "string";
  return undefined;
}

function stringifyExample(value: unknown): string {
  if (typeof value === "string") {
    return value.length > EXAMPLE_BODY_CAP
      ? `${value.slice(0, EXAMPLE_BODY_CAP)}\n… [truncated]`
      : value;
  }
  try {
    const json = JSON.stringify(value, null, 2);
    return json.length > EXAMPLE_BODY_CAP
      ? `${json.slice(0, EXAMPLE_BODY_CAP)}\n… [truncated]`
      : json;
  } catch {
    return String(value);
  }
}

function mapSecurity(
  op: Record<string, unknown>,
  doc: Record<string, unknown>,
  format: "openapi" | "swagger" | "unknown",
): ApiAuthentication | undefined {
  const security =
    (op.security as unknown[] | undefined) ??
    (doc.security as unknown[] | undefined);
  if (!Array.isArray(security) || security.length === 0) return undefined;

  const first = security[0];
  if (!first || typeof first !== "object") return undefined;
  const schemeName = Object.keys(first as Record<string, unknown>)[0];
  if (!schemeName) return undefined;

  let schemes: Record<string, unknown> = {};
  if (format === "openapi") {
    const components = doc.components as Record<string, unknown> | undefined;
    schemes = (components?.securitySchemes as Record<string, unknown>) ?? {};
  } else {
    schemes = (doc.securityDefinitions as Record<string, unknown>) ?? {};
  }

  const scheme = schemes[schemeName] as Record<string, unknown> | undefined;
  if (!scheme) {
    return { type: "custom", required: true };
  }

  const type = String(scheme.type ?? "").toLowerCase();
  if (
    type === "http" &&
    String(scheme.scheme ?? "").toLowerCase() === "bearer"
  ) {
    return { type: "bearer", required: true };
  }
  if (
    type === "http" &&
    String(scheme.scheme ?? "").toLowerCase() === "basic"
  ) {
    return { type: "basic", required: true };
  }
  if (type === "basic") {
    return { type: "basic", required: true };
  }
  if (type === "apikey" || type === "apiKey") {
    return {
      type: "apikey",
      required: true,
      scheme: String(scheme.name ?? "X-API-Key"),
    };
  }
  if (type === "oauth2") {
    return { type: "oauth2", required: true };
  }
  return { type: "custom", required: true };
}

function pickOperationName(
  op: Record<string, unknown>,
  method: string,
  path: string,
): string {
  if (typeof op.summary === "string" && op.summary.trim()) {
    return op.summary.trim();
  }
  if (typeof op.operationId === "string" && op.operationId.trim()) {
    return op.operationId.trim();
  }
  return `${method} ${path}`;
}
