import { generateId } from "@/utils/id";
import { parseUrlParts } from "@/utils/urlParts";
import type { KeyValue, RequestDraft } from "@/types/request";
import type { ApiResponse } from "@/types/response";
import type {
  NetworkLogEntry,
  NetworkProxyMode,
  NetworkTraceLine,
} from "@/store/slices/networkLogSlice";

export const NETWORK_BODY_CAP_BYTES = 256 * 1024;

export function snapshotRequestHeaders(
  headers: KeyValue[] | undefined,
): Record<string, string> {
  if (!headers?.length) return {};
  const out: Record<string, string> = {};
  for (const header of headers) {
    if (!header.enabled || !header.key.trim()) continue;
    out[header.key] = header.value;
  }
  return out;
}

export function snapshotRequestBody(draft: {
  bodyType: RequestDraft["bodyType"];
  body: string;
  formDataFields?: RequestDraft["formDataFields"];
}): string | null {
  if (draft.bodyType === "none") return null;
  if (draft.bodyType === "form-data") {
    const fields = draft.formDataFields ?? [];
    const enabled = fields.filter((f) => f.enabled && f.key.trim());
    if (!enabled.length) return null;
    const lines = enabled.map((f) => {
      if (f.type === "file") {
        const paths = f.filePaths?.length
          ? f.filePaths
          : f.filePath
            ? [f.filePath]
            : [];
        return `${f.key}: [file: ${paths.join(", ") || "unset"}]`;
      }
      return `${f.key}: ${f.value}`;
    });
    return `[multipart/form-data]\n${lines.join("\n")}`;
  }
  if (draft.bodyType === "binary") {
    return "[binary body omitted from network log]";
  }
  const body = draft.body?.trim();
  return body || null;
}

export function capNetworkBody(body: string | null | undefined): {
  body: string | null;
  truncated: boolean;
} {
  if (body == null || body === "") {
    return { body: null, truncated: false };
  }
  if (body.length <= NETWORK_BODY_CAP_BYTES) {
    return { body, truncated: false };
  }
  return {
    body: `${body.slice(0, NETWORK_BODY_CAP_BYTES)}\n\n… [truncated for network log]`,
    truncated: true,
  };
}

function formatTraceTime(epochMs: number): string {
  const date = new Date(epochMs);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function proxyLabel(mode: NetworkProxyMode): string {
  if (mode === "none") return "direct (no proxy)";
  if (mode === "custom") return "custom";
  return "system";
}

export function buildNetworkTrace(input: {
  startedAt: number;
  method: string;
  url: string;
  finalUrl?: string | null;
  requestHeaders?: Record<string, string>;
  statusCode?: number | null;
  statusText?: string | null;
  durationMs?: number | null;
  sizeBytes?: number | null;
  error?: string;
  proxyMode?: NetworkProxyMode;
  timing?: ApiResponse["timing"];
}): NetworkTraceLine[] {
  const lines: NetworkTraceLine[] = [];
  const push = (level: NetworkTraceLine["level"], message: string, at?: number) => {
    lines.push({ at: at ?? input.startedAt, level, message });
  };

  push(
    "info",
    `Preparing request to send at ${formatTraceTime(input.startedAt)}`,
    input.startedAt,
  );
  push(
    "info",
    `Proxy mode: ${proxyLabel(input.proxyMode ?? "none")}`,
    input.startedAt + 1,
  );
  push(
    "request",
    `${input.method.toUpperCase()} ${input.url}`,
    input.startedAt + 2,
  );

  const headers = input.requestHeaders ?? {};
  for (const [key, value] of Object.entries(headers)) {
    push("info", `${key}: ${value}`, input.startedAt + 3);
  }

  try {
    const parsed = new URL(
      /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input.url)
        ? input.url
        : `https://${input.url}`,
    );
    const port =
      parsed.port ||
      (parsed.protocol === "https:" ? "443" : parsed.protocol === "http:" ? "80" : "");
    push(
      "info",
      `DNS: (not captured — reqwest resolves internally)`,
      input.startedAt + 4,
    );
    push(
      "success",
      `Connected to ${parsed.hostname}${port ? ` (${parsed.hostname}:${port})` : ""}`,
      input.startedAt + 5,
    );
  } catch {
    push("warn", "Could not parse URL for connection details", input.startedAt + 4);
  }

  if (input.finalUrl && input.finalUrl !== input.url) {
    push("info", `Final URL after redirects: ${input.finalUrl}`, input.startedAt + 6);
  }

  if (input.timing) {
    if (input.timing.connect_ms != null) {
      push("info", `Connect: ${input.timing.connect_ms}ms`, input.startedAt + 7);
    }
    if (input.timing.ttfb_ms != null) {
      push("info", `TTFB: ${input.timing.ttfb_ms}ms`, input.startedAt + 8);
    }
    push("info", `Total: ${input.timing.total_ms}ms`, input.startedAt + 9);
  }

  if (input.error) {
    push("error", "there was an error executing the request!", input.startedAt + 10);
    push("error", input.error, input.startedAt + 11);
    return lines;
  }

  if (input.statusCode != null) {
    const statusLabel = input.statusText
      ? `${input.statusCode} ${input.statusText}`
      : String(input.statusCode);
    push("success", `Response: ${statusLabel}`, input.startedAt + 10);
    if (input.durationMs != null) {
      push("info", `Duration: ${Math.round(input.durationMs)}ms`, input.startedAt + 11);
    }
    if (input.sizeBytes != null) {
      push("info", `Size: ${input.sizeBytes} bytes`, input.startedAt + 12);
    }
  }

  return lines;
}

export function buildNetworkLogEntry(input: {
  method: string;
  url: string;
  statusCode?: number | null;
  statusText?: string | null;
  finalUrl?: string | null;
  durationMs?: number | null;
  sizeBytes?: number | null;
  startedAt?: number;
  tabId?: string;
  error?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string | null;
  responseHeaders?: Record<string, string>;
  responseBody?: string | null;
  responseBodyTruncated?: boolean;
  timing?: ApiResponse["timing"];
  proxyMode?: NetworkProxyMode;
  trace?: NetworkTraceLine[];
}): NetworkLogEntry {
  const { domain, path } = parseUrlParts(input.url);
  const durationMs = input.durationMs ?? null;
  const startedAt =
    input.startedAt ??
    (durationMs != null ? Date.now() - durationMs : Date.now());

  const responseCap = capNetworkBody(input.responseBody);
  const requestCap = capNetworkBody(input.requestBody);

  const trace =
    input.trace ??
    buildNetworkTrace({
      startedAt,
      method: input.method || "GET",
      url: input.url,
      finalUrl: input.finalUrl,
      requestHeaders: input.requestHeaders,
      statusCode: input.statusCode,
      statusText: input.statusText,
      durationMs,
      sizeBytes: input.sizeBytes,
      error: input.error,
      proxyMode: input.proxyMode ?? "none",
      timing: input.timing,
    });

  return {
    id: generateId(),
    method: input.method || "GET",
    statusCode: input.statusCode ?? null,
    statusText: input.statusText ?? null,
    url: input.url,
    finalUrl: input.finalUrl ?? null,
    domain,
    path,
    startedAt,
    durationMs,
    sizeBytes: input.sizeBytes ?? null,
    tabId: input.tabId,
    error: input.error,
    requestHeaders: input.requestHeaders,
    requestBody: requestCap.body,
    responseHeaders: input.responseHeaders,
    responseBody: responseCap.body,
    responseBodyTruncated:
      input.responseBodyTruncated ?? responseCap.truncated,
    timing: input.timing,
    proxyMode: input.proxyMode ?? "none",
    trace,
  };
}

export function buildNetworkLogFromResponse(input: {
  method: string;
  url: string;
  request: Pick<RequestDraft, "headers" | "body" | "bodyType" | "formDataFields">;
  response?: ApiResponse | null;
  startedAt: number;
  tabId?: string;
  error?: string;
}): NetworkLogEntry {
  const requestHeaders = snapshotRequestHeaders(input.request.headers);
  const requestBody = snapshotRequestBody(input.request);

  if (!input.response) {
    return buildNetworkLogEntry({
      method: input.method,
      url: input.url,
      startedAt: input.startedAt,
      tabId: input.tabId,
      error: input.error ?? "Request failed",
      durationMs: Date.now() - input.startedAt,
      requestHeaders,
      requestBody,
      proxyMode: "none",
    });
  }

  return buildNetworkLogEntry({
    method: input.response.request_method ?? input.method,
    url: input.url,
    finalUrl: input.response.final_url,
    statusCode: input.response.status,
    statusText: input.response.status_text,
    durationMs: input.response.duration_ms,
    sizeBytes: input.response.size_bytes,
    startedAt: input.startedAt,
    tabId: input.tabId,
    error: input.response.error ?? input.error,
    requestHeaders,
    requestBody,
    responseHeaders: input.response.headers,
    responseBody: input.response.body,
    timing: input.response.timing,
    proxyMode: "none",
  });
}
