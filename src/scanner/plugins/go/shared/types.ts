import type { FileSystemAdapter } from "../../../core/types";
import type { ScanOptions, ScanProgress } from "../../../models/scan-result";
import type {
  ApiAuthentication,
  ApiEndpoint,
  ApiMiddleware,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
  HttpMethod,
} from "../../../models/endpoint";
import { createEndpointId } from "../../../models/endpoint";

export interface GoDependencies {
  [modulePath: string]: string;
}

export interface GoProjectInfo {
  modulePath?: string;
  dependencies: GoDependencies;
  warnings: string[];
  projectRoot: string;
}

export interface GoScanContext {
  projectPath: string;
  fs: FileSystemAdapter;
  options: ScanOptions;
  project: GoProjectInfo;
  onProgress?: (progress: ScanProgress) => void;
}

export interface RawRoute {
  method: HttpMethod;
  path: string;
  handler?: string;
  summary?: string;
  description?: string;
  tags: string[];
  folder: string[];
  sourceFile: string;
  lineNumber?: number;
  pathParameters: ApiParameter[];
  queryParameters: ApiParameter[];
  headers: ApiParameter[];
  requestBody?: ApiRequestBody;
  authentication?: ApiAuthentication;
  responses: ApiResponse[];
  middleware: ApiMiddleware[];
  warnings: string[];
}

export function rawRoutesToEndpoints(
  routes: RawRoute[],
  frameworkId: string,
): ApiEndpoint[] {
  return routes.map((route) => ({
    id: createEndpointId(route.method, route.path, route.sourceFile),
    name: route.summary ?? route.handler ?? `${route.method} ${route.path}`,
    method: route.method,
    path: route.path,
    description: route.description,
    tags: [frameworkId, ...route.tags],
    folder:
      route.folder.length > 0
        ? route.folder
        : route.tags.length > 0
          ? route.tags
          : ["General"],
    headers: route.headers,
    authentication: route.authentication,
    queryParameters: route.queryParameters,
    pathParameters: route.pathParameters,
    requestBody: route.requestBody,
    responses: route.responses.length > 0 ? route.responses : [{ statusCode: 200 }],
    middleware: route.middleware,
    sourceFile: route.sourceFile,
    handler: route.handler,
    lineNumber: route.lineNumber,
    framework: frameworkId,
    warnings: route.warnings,
  }));
}

export function dedupeRoutes(routes: RawRoute[]): RawRoute[] {
  const seen = new Map<string, RawRoute>();
  for (const route of routes) {
    const key = `${route.method}:${route.path}`;
    if (!seen.has(key)) seen.set(key, route);
  }
  return Array.from(seen.values());
}
