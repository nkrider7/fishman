import { buildRequestPayload } from "@/utils/requestBuilder";
import { executeRequest } from "@/tauri/http";
import type { RequestDraft } from "@/types/request";
import type { ApiResponse } from "@/types/response";
import type { AppSettings } from "@/types/settings";
import type { StoredCookie } from "@/types/cookie";
import { normalizeSetCookies } from "@/utils/normalizeSetCookies";

/**
 * Send an HTTP request via the Tauri/Rust client.
 *
 * Optional `signal`: when aborted, the JS promise rejects with AbortError so
 * callers (e.g. API Testing) can stop spawning work. The underlying Rust
 * request may still finish until its timeout — there is no request-id cancel
 * yet. Callers should treat abort as “stop scheduling” + drain UI.
 */
export async function sendHttpRequest(
  request: RequestDraft,
  settings: Pick<AppSettings, "ignoreSsl" | "timeoutMs">,
  variables?: Record<string, string>,
  cookies: StoredCookie[] = [],
  signal?: AbortSignal,
): Promise<ApiResponse> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const payload = buildRequestPayload(request, {
    ignoreSsl: settings.ignoreSsl,
    timeoutMs: settings.timeoutMs,
    variables,
    cookies,
  });

  const run = async (): Promise<ApiResponse> => {
    const response = await executeRequest(payload);
    const setCookies = normalizeSetCookies(response, payload.url);
    return {
      ...response,
      set_cookies: setCookies,
      final_url: response.final_url ?? payload.url,
    };
  };

  if (!signal) {
    return run();
  }

  return new Promise<ApiResponse>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    run()
      .then((res) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        resolve(res);
      })
      .catch((err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}
