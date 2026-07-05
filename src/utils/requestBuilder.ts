import type { AuthConfig, FormDataField, KeyValue, RequestDraft } from "@/types/request";
import { substituteRequestDraft } from "@/utils/variableSubstitution";

export function buildUrlWithParams(url: string, params: KeyValue[]): string {
  const enabled = params.filter((p) => p.enabled && p.key);
  if (enabled.length === 0) return url;

  const separator = url.includes("?") ? "&" : "?";
  const query = enabled
    .map(
      (p) =>
        `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`,
    )
    .join("&");
  return `${url}${separator}${query}`;
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
  options: { ignoreSsl: boolean; timeoutMs: number; variables?: Record<string, string> },
) {
  const resolved =
    options.variables && Object.keys(options.variables).length > 0
      ? substituteRequestDraft(request, options.variables)
      : request;

  const params = applyApiKeyToParams(resolved.params, resolved.auth);
  const url = buildUrlWithParams(resolved.url, params);
  const headers = applyAuthToHeaders(resolved.headers, resolved.auth).map(
    ({ key, value, enabled }) => ({ key, value, enabled }),
  );

  const isFormData = resolved.bodyType === "form-data";
  const formDataFields = resolved.formDataFields ?? [];

  return {
    method: resolved.method,
    url,
    headers,
    body:
      resolved.bodyType === "none" || isFormData ? undefined : resolved.body,
    body_type: resolved.bodyType,
    form_data: isFormData
      ? formDataFields.map((field: FormDataField) => ({
          key: field.key,
          type: field.type,
          value: field.type === "text" ? field.value : undefined,
          file_path: field.type === "file" ? field.filePath : undefined,
          enabled: field.enabled,
        }))
      : undefined,
    timeout_ms: options.timeoutMs,
    ignore_ssl: options.ignoreSsl,
  };
}

export function getMethodClass(method: string): string {
  return `method-${method.toLowerCase()}`;
}

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
