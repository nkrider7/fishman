import type { RawRoute } from "./types";
import type { AuthPattern } from "./auth-detector";
import { detectEndpointAuth } from "./auth-detector";
import { extractPathParamsFromPattern } from "./schema-extractor";
import { flaskPathToOpenApi, toHttpMethod } from "./ast-utils";

export function regexExtractFlaskRoutes(
  source: string,
  sourceFile: string,
  moduleAuth: AuthPattern[],
): RawRoute[] {
  const routes: RawRoute[] = [];

  const decoratorRe =
    /@(\w+)\.route\s*\(\s*["']([^"']+)["'](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = decoratorRe.exec(source)) !== null) {
    const path = flaskPathToOpenApi(m[2]);
    const methodsStr = m[3];
    const methods = methodsStr
      ? methodsStr.match(/["'](\w+)["']/g)?.map((s) => s.replace(/["']/g, "")) ?? ["GET"]
      : ["GET"];

    const fnMatch = source.slice(m.index).match(/def\s+(\w+)\s*\(/);
    const handler = fnMatch?.[1];

    for (const method of methods) {
      routes.push(makeRegexRoute(method, path, sourceFile, handler, moduleAuth, source));
    }
  }

  const appRouteRe =
    /@app\.route\s*\(\s*["']([^"']+)["'](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?\s*\)/g;
  while ((m = appRouteRe.exec(source)) !== null) {
    const path = flaskPathToOpenApi(m[1]);
    const methodsStr = m[2];
    const methods = methodsStr
      ? methodsStr.match(/["'](\w+)["']/g)?.map((s) => s.replace(/["']/g, "")) ?? ["GET"]
      : ["GET"];
    const fnMatch = source.slice(m.index).match(/def\s+(\w+)\s*\(/);
    const handler = fnMatch?.[1];

    for (const method of methods) {
      routes.push(makeRegexRoute(method, path, sourceFile, handler, moduleAuth, source));
    }
  }

  return routes;
}

export function regexExtractFastAPIRoutes(
  source: string,
  sourceFile: string,
  moduleAuth: AuthPattern[],
): RawRoute[] {
  const routes: RawRoute[] = [];
  const re =
    /@(\w+)\.(get|post|put|patch|delete|options|head)\s*\(\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const method = m[2];
    const path = m[3];
    const fnMatch = source.slice(m.index).match(/(?:async\s+)?def\s+(\w+)\s*\(/);
    routes.push(makeRegexRoute(method, path, sourceFile, fnMatch?.[1], moduleAuth, source));
  }
  return routes;
}

export function regexExtractDjangoUrls(
  source: string,
  sourceFile: string,
  prefix = "",
): RawRoute[] {
  const routes: RawRoute[] = [];

  const pathRe = /path\s*\(\s*["']([^"']+)["']\s*,\s*([^,)]+)/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(source)) !== null) {
    const subPath = m[1];
    const view = m[2].trim();
    const fullPath = prefix ? `${prefix}/${subPath}`.replace(/\/+/g, "/") : `/${subPath}`;
    const methods = inferDjangoMethods(view, source);
    for (const method of methods) {
      routes.push({
        method,
        path: fullPath,
        handler: view.replace(/\.$/, ""),
        tags: [],
        folder: [],
        sourceFile,
        pathParameters: extractPathParamsFromPattern(fullPath),
        queryParameters: [],
        responses: [{ statusCode: 200 }],
        middleware: [],
        warnings: [],
      });
    }
  }

  const includeRe = /path\s*\(\s*["']([^"']+)["']\s*,\s*include\s*\(/g;
  while ((m = includeRe.exec(source)) !== null) {
    routes.push({
      method: "GET",
      path: prefix ? `${prefix}/${m[1]}`.replace(/\/+/g, "/") : `/${m[1]}`,
      handler: "include",
      tags: [],
      folder: [],
      sourceFile,
      pathParameters: [],
      queryParameters: [],
      responses: [{ statusCode: 200 }],
      middleware: [],
      warnings: ["Included URLconf — resolve imports for full route tree"],
    });
  }

  return routes;
}

function inferDjangoMethods(
  view: string,
  _source: string,
): import("../../../models/endpoint").HttpMethod[] {
  if (/\.as_view\s*\(\s*\)/.test(view)) {
    if (/ListAPIView|RetrieveAPIView|List/.test(view)) return ["GET"];
    if (/CreateAPIView/.test(view)) return ["POST"];
    if (/UpdateAPIView/.test(view)) return ["PUT", "PATCH"];
    if (/DestroyAPIView/.test(view)) return ["DELETE"];
    return ["GET", "POST", "PUT", "PATCH", "DELETE"];
  }
  if (/ViewSet/.test(view)) {
    return ["GET", "POST", "PUT", "PATCH", "DELETE"];
  }
  return ["GET"];
}

function makeRegexRoute(
  method: string,
  path: string,
  sourceFile: string,
  handler: string | undefined,
  moduleAuth: AuthPattern[],
  source: string,
): RawRoute {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return {
    method: toHttpMethod(method),
    path: normalizedPath,
    handler,
    tags: [],
    folder: [],
    sourceFile,
    pathParameters: extractPathParamsFromPattern(normalizedPath),
    queryParameters: [],
    authentication: detectEndpointAuth(source, "", moduleAuth),
    responses: [{ statusCode: 200 }],
    middleware: [],
    warnings: ["Extracted via regex fallback"],
  };
}
