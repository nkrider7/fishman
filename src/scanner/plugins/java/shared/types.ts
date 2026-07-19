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

export interface JavaDependencies {
  [artifactKey: string]: string;
}

export interface JavaProjectInfo {
  buildSystem: "maven" | "gradle" | "unknown";
  dependencies: JavaDependencies;
  springBootVersion?: string;
  contextPath?: string;
  servletPath?: string;
  entryClasses: string[];
  sourceRoots: string[];
  warnings: string[];
  projectRoot: string;
}

export interface JavaScanContext {
  projectPath: string;
  fs: FileSystemAdapter;
  options: ScanOptions;
  project: JavaProjectInfo;
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
  controller?: string;
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

export interface ClassSchema {
  name: string;
  fields: SchemaField[];
  sourceFile: string;
}

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
}

export interface ParsedAnnotation {
  name: string;
  args: AnnotationArgMap;
  raw: string;
  startIndex: number;
}

export type AnnotationArgMap = Record<string, string | string[] | boolean | undefined>;

export interface ParsedMethodParam {
  annotations: ParsedAnnotation[];
  type: string;
  name: string;
  isVarargs?: boolean;
}

export interface ParsedControllerMethod {
  annotations: ParsedAnnotation[];
  name: string;
  returnType: string;
  params: ParsedMethodParam[];
  startIndex: number;
  lineNumber?: number;
}

export interface ParsedControllerClass {
  name: string;
  annotations: ParsedAnnotation[];
  methods: ParsedControllerMethod[];
  isRestController: boolean;
  sourceFile: string;
  packageName?: string;
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
    controller: route.controller,
    handler: route.handler,
    lineNumber: route.lineNumber,
    framework: frameworkId,
    warnings: route.warnings,
  }));
}
