import type { AuthConfig, FormDataField, KeyValue, RequestDraft } from "@/types/request";
import { getFormDataFilePaths } from "@/types/request";
import type { FormDataPart } from "@/types/response";
import type { StoredCookie } from "@/types/cookie";
import { buildCookieHeader, selectCookiesForUrl } from "@/utils/cookies";
import { substituteRequestDraft } from "@/utils/variableSubstitution";
import { ensureGraphQLConfig, syncGraphQLBody } from "@/graphql";

function toFormDataParts(fields: FormDataField[]): FormDataPart[] {
  const parts: FormDataPart[] = [];

  for (const field of fields) {
    if (field.type === "file") {
      for (const filePath of getFormDataFilePaths(field)) {
        parts.push({
          key: field.key,
          type: field.type,
          file_path: filePath,
          enabled: field.enabled,
        });
      }
      continue;
    }

    parts.push({
      key: field.key,
      type: field.type,
      value: field.value,
      enabled: field.enabled,
    });
  }

  return parts;
}

function encodeQueryComponentForDisplay(value: string): string {
  // Keep `{{vars}}` / `$dynamics` readable in the URL bar; only escape
  // characters that would break query parsing.
  return value
    .replace(/%/g, "%25")
    .replace(/&/g, "%26")
    .replace(/#/g, "%23")
    .replace(/\+/g, "%2B")
    .replace(/=/g, "%3D")
    .replace(/\s/g, "%20");
}

export function buildUrlWithParams(
  url: string,
  params: KeyValue[],
  options?: { encode?: "full" | "display" },
): string {
  const { base, hash } = splitUrlParts(url);
  const enabled = params.filter((p) => p.enabled && p.key);
  if (enabled.length === 0) return `${base}${hash}`;

  const encode =
    options?.encode === "display"
      ? encodeQueryComponentForDisplay
      : encodeURIComponent;

  const query = enabled
    .map((p) => `${encode(p.key)}=${encode(p.value)}`)
    .join("&");
  return `${base}?${query}${hash}`;
}

/** Split `base?query#hash` without using URL() so `{{vars}}` stay intact. */
export function splitUrlParts(url: string): {
  base: string;
  query: string;
  hash: string;
} {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const qIndex = withoutHash.indexOf("?");
  if (qIndex < 0) {
    return { base: withoutHash, query: "", hash };
  }
  return {
    base: withoutHash.slice(0, qIndex),
    query: withoutHash.slice(qIndex + 1),
    hash,
  };
}

/**
 * Rebuild the URL query for the URL bar — keeps `{{vars}}` readable.
 * Actual HTTP Send still uses full encoding via `buildUrlWithParams`.
 */
export function syncUrlWithParams(url: string, params: KeyValue[]): string {
  return buildUrlWithParams(url, params, { encode: "display" });
}

/**
 * Parse the URL query into KeyValue rows, reusing previous row ids / enabled flags
 * when the same key still exists (stable editing experience).
 */
export function syncParamsFromUrl(
  url: string,
  previous: KeyValue[],
): KeyValue[] {
  const { query } = splitUrlParts(url);
  if (!query.trim()) {
    // Keep blank draft rows so the editor doesn't jump empty → nothing.
    const blanks = previous.filter((p) => !p.key.trim() && !p.value.trim());
    return blanks.length > 0 ? blanks : [];
  }

  const available = [...previous];
  const next: KeyValue[] = [];

  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    const rawValue = eq >= 0 ? part.slice(eq + 1) : "";
    let key = rawKey;
    let value = rawValue;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      value = decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch {
      // keep raw if malformed escape
    }

    const reuseIndex = available.findIndex((p) => p.key === key);
    if (reuseIndex >= 0) {
      const [row] = available.splice(reuseIndex, 1);
      next.push({ ...row, key, value, enabled: row.enabled !== false });
    } else {
      next.push({
        id: crypto.randomUUID(),
        key,
        value,
        enabled: true,
      });
    }
  }

  // Preserve trailing blank rows for continued editing.
  for (const row of available) {
    if (!row.key.trim() && !row.value.trim()) next.push(row);
  }

  return next;
}

export function applyAuthToHeaders(
  headers: KeyValue[],
  auth: AuthConfig,
): KeyValue[] {
  const result = headers.filter(
    (h) => h.key.toLowerCase() !== "authorization",
  );

  switch (auth.type) {
    case "bearer":
      if (auth.bearer?.token) {
        result.push({
          id: "auth-bearer",
          key: "Authorization",
          value: `Bearer ${auth.bearer.token}`,
          enabled: true,
        });
      }
      break;
    case "basic":
      if (auth.basic) {
        const encoded = btoa(
          `${auth.basic.username}:${auth.basic.password}`,
        );
        result.push({
          id: "auth-basic",
          key: "Authorization",
          value: `Basic ${encoded}`,
          enabled: true,
        });
      }
      break;
    case "apikey":
      if (auth.apikey?.addTo === "header" && auth.apikey.key) {
        result.push({
          id: "auth-apikey",
          key: auth.apikey.key,
          value: auth.apikey.value,
          enabled: true,
        });
      }
      break;
    case "jwt":
      if (auth.jwt?.token) {
        result.push({
          id: "auth-jwt",
          key: "Authorization",
          value: `Bearer ${auth.jwt.token}`,
          enabled: true,
        });
      }
      break;
    case "custom":
      if (auth.custom?.key) {
        result.push({
          id: "auth-custom",
          key: auth.custom.key,
          value: auth.custom.value,
          enabled: true,
        });
      }
      break;
    case "oauth2":
      if (auth.oauth2?.accessToken) {
        result.push({
          id: "auth-oauth2",
          key: "Authorization",
          value: `Bearer ${auth.oauth2.accessToken}`,
          enabled: true,
        });
      }
      break;
  }

  return result;
}

export function applyApiKeyToParams(
  params: KeyValue[],
  auth: AuthConfig,
): KeyValue[] {
  if (auth.type === "apikey" && auth.apikey?.addTo === "query" && auth.apikey.key) {
    return [
      ...params,
      {
        id: "auth-apikey-query",
        key: auth.apikey.key,
        value: auth.apikey.value,
        enabled: true,
      },
    ];
  }
  return params;
}

export function buildRequestPayload(
  request: RequestDraft,
  options: {
    ignoreSsl: boolean;
    timeoutMs: number;
    variables?: Record<string, string>;
    /** Cookie jar entries; matching cookies are attached unless Cookie header already set. */
    cookies?: StoredCookie[];
  },
) {
  const resolved =
    options.variables && Object.keys(options.variables).length > 0
      ? substituteRequestDraft(request, options.variables)
      : request;

  const params = applyApiKeyToParams(resolved.params, resolved.auth);
  const url = buildUrlWithParams(resolved.url, params);
  let headers = applyAuthToHeaders(resolved.headers, resolved.auth).map(
    ({ key, value, enabled }) => ({ key, value, enabled }),
  );

  const hasCookieHeader = headers.some(
    (h) => h.enabled && h.key.toLowerCase() === "cookie",
  );
  if (!hasCookieHeader && options.cookies?.length) {
    const matched = selectCookiesForUrl(options.cookies, url);
    const cookieHeader = buildCookieHeader(matched);
    if (cookieHeader) {
      headers = [
        ...headers,
        { key: "Cookie", value: cookieHeader, enabled: true },
      ];
    }
  }

  const isFormData = resolved.bodyType === "form-data";
  const formDataFields = resolved.formDataFields ?? [];

  let body: string | undefined =
    resolved.bodyType === "none" || isFormData ? undefined : resolved.body;

  if (resolved.bodyType === "graphql") {
    const graphql = ensureGraphQLConfig(resolved);
    body = graphql ? syncGraphQLBody(graphql) : resolved.body;
    const hasContentType = headers.some(
      (h) => h.enabled && h.key.toLowerCase() === "content-type",
    );
    if (!hasContentType) {
      headers = [
        ...headers,
        { key: "Content-Type", value: "application/json", enabled: true },
      ];
    }
  }

  return {
    method: resolved.method,
    url,
    headers,
    body,
    body_type: resolved.bodyType,
    form_data: isFormData ? toFormDataParts(formDataFields) : undefined,
    timeout_ms: options.timeoutMs,
    ignore_ssl: options.ignoreSsl,
  };
}

export { getMethodCssClass as getMethodClass } from "@/http-methods/registry";


export function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function minifyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

export function isJsonContent(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
