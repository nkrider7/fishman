import { buildRequestPayload } from "@/utils/requestBuilder";
import { executeRequest } from "@/tauri/http";
import type { RequestDraft } from "@/types/request";
import type { ApiResponse } from "@/types/response";
import type { AppSettings } from "@/types/settings";
import type { StoredCookie } from "@/types/cookie";
import { normalizeSetCookies } from "@/utils/normalizeSetCookies";

export async function sendHttpRequest(
  request: RequestDraft,
  settings: Pick<AppSettings, "ignoreSsl" | "timeoutMs">,
  variables?: Record<string, string>,
  cookies: StoredCookie[] = [],
): Promise<ApiResponse> {
  const payload = buildRequestPayload(request, {
    ignoreSsl: settings.ignoreSsl,
    timeoutMs: settings.timeoutMs,
    variables,
    cookies,
  });
  const response = await executeRequest(payload);
  const setCookies = normalizeSetCookies(response, payload.url);

  return {
    ...response,
    set_cookies: setCookies,
    final_url: response.final_url ?? payload.url,
  };
}
