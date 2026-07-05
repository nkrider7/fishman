import { buildRequestPayload } from "@/utils/requestBuilder";
import { executeRequest } from "@/tauri/http";
import type { RequestDraft } from "@/types/request";
import type { ApiResponse } from "@/types/response";
import type { AppSettings } from "@/types/settings";

export async function sendHttpRequest(
  request: RequestDraft,
  settings: Pick<AppSettings, "ignoreSsl" | "timeoutMs">,
  variables?: Record<string, string>,
): Promise<ApiResponse> {
  const payload = buildRequestPayload(request, {
    ignoreSsl: settings.ignoreSsl,
    timeoutMs: settings.timeoutMs,
    variables,
  });
  return executeRequest(payload);
}
