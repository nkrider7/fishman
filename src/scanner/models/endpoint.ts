import type { AuthType, HttpMethod } from "@/types/request";

export type { HttpMethod };

export interface ApiParameter {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
  example?: string | number | boolean;
  in: "query" | "path" | "header" | "cookie";
}

export interface ApiRequestBody {
  contentType: string;
  schema?: Record<string, unknown>;
  example?: string;
  raw?: string;
}

export interface ApiResponse {
  statusCode: number;
  description?: string;
  schema?: Record<string, unknown>;
  example?: string;
}

export interface ApiAuthentication {
  type: AuthType | "session" | "oauth2" | "apikey" | "custom";
  scheme?: string;
  middleware?: string[];
  required: boolean;
}

export interface ApiMiddleware {
  name: string;
  type?: "auth" | "validation" | "rate-limit" | "cors" | "upload" | "logging" | "other";
  source?: string;
}

export interface ApiEndpoint {
  id: string;
  name: string;
  method: HttpMethod;
  path: string;
  description?: string;
  tags: string[];
  folder: string[];
  headers: ApiParameter[];
  authentication?: ApiAuthentication;
  queryParameters: ApiParameter[];
  pathParameters: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: ApiResponse[];
  middleware: ApiMiddleware[];
  sourceFile: string;
  controller?: string;
  handler?: string;
  lineNumber?: number;
  framework: string;
  warnings: string[];
}

export function createEndpointId(
  method: string,
  path: string,
  sourceFile: string,
): string {
  return `${method}:${path}:${sourceFile}`;
}
