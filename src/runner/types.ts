import type { ApiResponse } from "@/types/response";
import type {
  ScriptLogEntry,
  ScriptTestResult,
} from "@/script-engine/types";

export type RunnerPhase =
  | "idle"
  | "configuring"
  | "running"
  | "completed"
  | "cancelled";

export type RunnerResultStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

export type RunnerResultFilter = "all" | "passed" | "failed" | "skipped";

export interface RunnerQueueItem {
  requestId: string;
  name: string;
  method: string;
  folderPath: string;
  tags: string[];
}

export interface RunnerConfig {
  collectionId: string;
  folderId: string | null;
  collectionName: string;
  delayMs: number;
  includeTags: string[];
  excludeTags: string[];
  iterations: number;
  parallel: boolean;
  concurrency: number;
  stopOnFailure: boolean;
  failOnHttpError: boolean;
  saveResponses: boolean;
  persistVariables: boolean;
  recordHistory: boolean;
  dataFileName?: string;
  dataRows?: Record<string, unknown>[];
}

export interface RunnerItemResult {
  id: string;
  requestId: string;
  name: string;
  folderPath: string;
  method: string;
  iteration: number;
  status: RunnerResultStatus;
  httpStatus?: number;
  durationMs?: number;
  errorMessage?: string;
  skipReason?: string;
  tests: ScriptTestResult[];
  logs: ScriptLogEntry[];
  responsePreview?: ApiResponse | null;
  finalUrl?: string;
  requestUrl?: string;
}

export const DEFAULT_RUNNER_CONFIG: Omit<
  RunnerConfig,
  "collectionId" | "folderId" | "collectionName"
> = {
  delayMs: 0,
  includeTags: [],
  excludeTags: [],
  iterations: 1,
  parallel: false,
  concurrency: 5,
  stopOnFailure: false,
  failOnHttpError: false,
  saveResponses: true,
  persistVariables: true,
  recordHistory: false,
};

export const RESPONSE_BODY_CAP_BYTES = 1_000_000;

export function capResponse(
  response: ApiResponse | null | undefined,
  saveResponses: boolean,
): ApiResponse | null {
  if (!response || !saveResponses) return null;
  if (response.body.length <= RESPONSE_BODY_CAP_BYTES) return response;
  return {
    ...response,
    body: `${response.body.slice(0, RESPONSE_BODY_CAP_BYTES)}\n\n… [truncated for runner storage]`,
  };
}

export function judgeResultStatus(options: {
  skipped: boolean;
  errorMessage?: string;
  httpStatus?: number;
  failOnHttpError: boolean;
  tests: ScriptTestResult[];
}): RunnerResultStatus {
  if (options.skipped) return "skipped";
  if (options.errorMessage) return "failed";
  if (options.tests.some((t) => t.status === "failed")) return "failed";
  if (
    options.failOnHttpError &&
    options.httpStatus !== undefined &&
    options.httpStatus >= 400
  ) {
    return "failed";
  }
  return "passed";
}
