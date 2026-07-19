import type { AuthConfig, BodyType, HttpMethod } from "@/types/request";
import type { CookieChange } from "@/types/cookie";

export type { CookieChange };

export type ScriptType = "pre-request" | "post-response" | "test";

export type ScriptLogLevel =
  | "log"
  | "info"
  | "warn"
  | "error"
  | "debug"
  | "table";

export type VariableScope =
  | "local"
  | "folder"
  | "collection"
  | "environment"
  | "workspace"
  | "global"
  | "system";

export type TestStatus = "passed" | "failed" | "skipped";

export interface ScriptLogEntry {
  id: string;
  level: ScriptLogLevel;
  message: string;
  timestamp: number;
  scriptType: ScriptType;
  requestId: string;
  durationMs?: number;
  line?: number;
  column?: number;
}

export interface ScriptError {
  message: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface ScriptTestResult {
  name: string;
  status: TestStatus;
  durationMs: number;
  error?: ScriptError;
}

export interface ScriptRequestState {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  params: Record<string, string>;
  body: string;
  bodyType: BodyType;
  auth: AuthConfig;
}

export interface ScriptResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  time: number;
}

export interface VariableChange {
  key: string;
  value: string;
  scope: VariableScope;
}

export interface ScriptExecutionResult {
  success: boolean;
  durationMs: number;
  logs: ScriptLogEntry[];
  tests: ScriptTestResult[];
  variableChanges: VariableChange[];
  cookieChanges?: CookieChange[];
  requestChanges?: Partial<ScriptRequestState>;
  aborted: boolean;
  /** Name or id of the next request to jump to (collection runner control flow). */
  nextRequestName?: string | null;
  error?: ScriptError;
}

export interface ScriptVariableMap {
  local: Record<string, string>;
  folder: Record<string, string>;
  collection: Record<string, string>;
  environment: Record<string, string>;
  workspace: Record<string, string>;
  global: Record<string, string>;
  system: Record<string, string>;
}

export interface SendRequestSpec {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SendRequestResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
}

export interface ScriptExecutionContext {
  requestId: string;
  /** Human-readable request name for `fishman.info.requestName`. */
  requestName?: string;
  scriptType: ScriptType;
  request: ScriptRequestState;
  response?: ScriptResponseState;
  variables: ScriptVariableMap;
  /** Cookie name→value map for the current request URL. */
  cookies?: Record<string, string>;
  /** Current data-file row for collection runner iterations. */
  iterationData?: Record<string, unknown>;
  /** 1-based iteration index when running with iterations/data file. */
  iteration?: number;
  iterationCount?: number;
  timeoutMs: number;
  maxMemoryMb?: number;
}

export interface ScriptExecutionOptions {
  timeoutMs?: number;
  onSendRequest?: (spec: SendRequestSpec) => Promise<SendRequestResult>;
  signal?: AbortSignal;
}

export interface ScriptPipelineInput {
  requestId: string;
  requestName?: string;
  request: ScriptRequestState;
  preRequestScript?: string;
  postResponseScript?: string;
  testScript?: string;
  response?: ScriptResponseState;
  variables: ScriptVariableMap;
  cookies?: Record<string, string>;
  iterationData?: Record<string, unknown>;
  iteration?: number;
  iterationCount?: number;
  options?: ScriptExecutionOptions;
}

export interface ScriptPipelineResult {
  request: ScriptRequestState;
  variables: ScriptVariableMap;
  preRequest?: ScriptExecutionResult;
  postResponse?: ScriptExecutionResult;
  tests?: ScriptExecutionResult;
  aborted: boolean;
  nextRequestName?: string | null;
  timeline: ScriptTimelineEntry[];
}

export interface ScriptTimelineEntry {
  stage: "pre-request" | "http" | "post-response" | "tests";
  durationMs: number;
  success: boolean;
  error?: string;
}
