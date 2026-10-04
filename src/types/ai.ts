import type { HttpMethod, BodyType } from "./request";

export interface AiKeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface AiGeneratedRequest {
  name: string;
  method: HttpMethod;
  url: string;
  headers: AiKeyValue[];
  params: AiKeyValue[];
  bodyType: BodyType;
  body: string;
  description?: string;
}

export interface AiToolCall {
  name:
    | "generate_http_request"
    | "curl_to_request"
    | "extract_json_schema"
    | "set_environment_variable"
    | "search_workspace"
    | string;
  arguments: Record<string, unknown>;
}

export interface SetVariableResult {
  key: string;
  value: string;
}

export interface AiCopilotResult {
  toolCall: AiToolCall;
  generatedRequest?: AiGeneratedRequest;
  generatedSchema?: string;
  setVariable?: SetVariableResult;
  searchQuery?: string;
  rawOutput: string;
  latencyMs: number;
}

export interface AiEngineStatus {
  ready: boolean;
  modelLoaded: boolean;
  modelPath?: string;
  engineType: string;
  ramUsageMb: number;
  error?: string;
}

export interface AiWorkspaceContext {
  activeCollectionName?: string;
  activeUrl?: string;
  activeMethod?: string;
  environmentNames: string[];
}

export interface AiChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: number;
  result?: AiCopilotResult;
  error?: string;
}

export interface AiScannedEndpoint {
  id: string;
  name: string;
  method: HttpMethod;
  path: string;
  description?: string;
  folder: string[];
  headers: AiKeyValue[];
  params: AiKeyValue[];
  bodyType: BodyType;
  body: string;
  sourceFile: string;
  lineNumber?: number;
  framework: string;
  requiresAuth: boolean;
  authType?: string;
}

export interface AiScanProgress {
  currentFile: string;
  filesScanned: number;
  totalFiles: number;
  endpointsFound: number;
}

export interface AiScanSummary {
  projectPath: string;
  frameworkDetected: string;
  filesScanned: number;
  endpoints: AiScannedEndpoint[];
  baseUrl: string;
  collectionName: string;
  durationMs: number;
}

