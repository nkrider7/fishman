import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AiEngineStatus,
  AiCopilotResult,
  AiGeneratedRequest,
  AiWorkspaceContext,
  AiScanSummary,
  AiScanProgress,
} from "@/types/ai";

export async function getAiEngineStatus(): Promise<AiEngineStatus> {
  try {
    return await invoke<AiEngineStatus>("ai_get_status");
  } catch (err) {
    return {
      ready: false,
      modelLoaded: false,
      engineType: "Unavailable",
      ramUsageMb: 0,
      error: String(err),
    };
  }
}

export async function runAiCopilot(
  prompt: string,
  context?: AiWorkspaceContext,
): Promise<AiCopilotResult> {
  return invoke<AiCopilotResult>("ai_run_copilot", {
    prompt,
    context,
  });
}

export async function parseCurlCommand(
  curl: string,
): Promise<AiGeneratedRequest> {
  return invoke<AiGeneratedRequest>("ai_parse_curl", { curl });
}

export async function generateSchemaFromJson(
  sampleJson: string,
  format: "typescript" | "json_schema" = "typescript",
  rootName?: string,
): Promise<string> {
  return invoke<string>("ai_generate_schema", {
    sampleJson,
    format,
    rootName,
  });
}

export async function scanCodebaseWithAi(
  path: string,
  options?: { baseUrl?: string; defaultCollectionName?: string },
): Promise<AiScanSummary> {
  return invoke<AiScanSummary>("ai_scan_codebase", {
    path,
    options,
  });
}

export async function listenAiScanProgress(
  callback: (progress: AiScanProgress) => void,
): Promise<UnlistenFn> {
  return listen<AiScanProgress>("ai-scan-progress", (event) => {
    callback(event.payload);
  });
}

