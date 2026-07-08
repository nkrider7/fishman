import type { FileSystemAdapter } from "../../../core/types";
import type { ScanOptions } from "../../../models/scan-result";
import type {
  ApiAuthentication,
  ApiEndpoint,
  ApiParameter,
  ApiRequestBody,
  HttpMethod,
} from "../../../models/endpoint";
import { createEndpointId } from "../../../models/endpoint";
import type { ParsedPythonModule } from "../../../parsers/ast/python-parser";

export interface PythonDependencies {
  [packageName: string]: string;
}

export interface PythonProjectInfo {
  framework: string | null;
  projectRoot: string;
  entryFiles: string[];
  apiVersion?: string;
  pythonVersion?: string;
  dependencies: PythonDependencies;
  baseUrl: string;
  environment: Record<string, string>;
  warnings: string[];
}

export interface PythonScanContext {
  projectPath: string;
  fs: FileSystemAdapter;
  options: ScanOptions;
  project: PythonProjectInfo;
  onProgress?: (progress: import("../../../models/scan-result").ScanProgress) => void;
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
  requestBody?: ApiRequestBody;
  authentication?: ApiAuthentication;
  responses: import("../../../models/endpoint").ApiResponse[];
  middleware: import("../../../models/endpoint").ApiMiddleware[];
  warnings: string[];
}

export interface RouterMount {
  variable: string;
  prefix: string;
  kind: "app" | "router" | "blueprint";
  sourceFile: string;
  framework: string;
}

export interface IncludeEdge {
  parentVar: string;
  childVar: string;
  prefix: string;
  sourceFile: string;
}

export interface RouteGraph {
  mounts: RouterMount[];
  includes: IncludeEdge[];
  routes: RawRoute[];
}

export interface ClassSchema {
  name: string;
  fields: SchemaField[];
  sourceFile: string;
  baseClasses: string[];
}

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  validation: Record<string, unknown>;
  description?: string;
}

export interface PythonFrameworkScanner {
  readonly id: string;
  readonly name: string;
  detect(deps: PythonDependencies): boolean;
  findEntryPoints(ctx: PythonScanContext): Promise<string[]>;
  discoverRoutes(ctx: PythonScanContext): Promise<RawRoute[]>;
  extractSchemas(
    ctx: PythonScanContext,
    modules: ParsedPythonModule[],
  ): Map<string, ClassSchema>;
  extractAuthentication(ctx: PythonScanContext): Promise<ApiAuthentication[]>;
  extractEnvironment(ctx: PythonScanContext): Promise<Record<string, string>>;
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
    folder: route.folder.length > 0 ? route.folder : route.tags.length > 0 ? route.tags : ["General"],
    headers: [],
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
