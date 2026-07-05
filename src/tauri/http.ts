import { invoke } from "@tauri-apps/api/core";
import type { HttpRequestPayload, ApiResponse } from "@/types/response";

export async function executeRequest(
  payload: HttpRequestPayload,
): Promise<ApiResponse> {
  return invoke<ApiResponse>("execute_request", { payload });
}
