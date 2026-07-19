import type { SetCookieCapture } from "@/types/response";

type LooseResponse = {
  set_cookies?: unknown;
  setCookies?: unknown;
  final_url?: string | null;
  finalUrl?: string | null;
};

/**
 * Normalize Set-Cookie payloads from the Rust HTTP engine.
 * Accepts snake_case / camelCase and string-or-object entries.
 */
export function normalizeSetCookies(
  response: LooseResponse,
  fallbackUrl?: string,
): SetCookieCapture[] {
  const raw = response.set_cookies ?? response.setCookies ?? [];
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const fallback =
    fallbackUrl ||
    response.final_url ||
    response.finalUrl ||
    "https://localhost/";

  const out: SetCookieCapture[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      const value = entry.trim();
      if (value) out.push({ url: fallback, value });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const obj = entry as Record<string, unknown>;
    const value =
      typeof obj.value === "string"
        ? obj.value
        : typeof obj.header === "string"
          ? obj.header
          : typeof obj.set_cookie === "string"
            ? obj.set_cookie
            : null;
    if (!value?.trim()) continue;

    const url =
      (typeof obj.url === "string" && obj.url) ||
      (typeof obj.response_url === "string" && obj.response_url) ||
      fallback;

    out.push({ url, value: value.trim() });
  }
  return out;
}
