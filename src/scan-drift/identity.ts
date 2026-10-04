import type { ApiEndpoint } from "@/scanner/models/endpoint";
import type { RequestDraft } from "@/types/request";
import { extractPathFromUrl, normalizeMethod, normalizePath } from "./normalize";
import type { RequestScanMeta } from "./types";

/** Primary matching key: METHOD:normalizedPath */
export function computeScanKey(method: string, path: string): string {
  return `${normalizeMethod(method)}:${normalizePath(path)}`;
}

export function scanKeyFromEndpoint(endpoint: ApiEndpoint): string {
  return computeScanKey(endpoint.method, endpoint.path);
}

export function scanKeyFromDraft(draft: Pick<RequestDraft, "method" | "url" | "scan">): string {
  if (draft.scan?.scanKey) return draft.scan.scanKey;
  return computeScanKey(draft.method, extractPathFromUrl(draft.url));
}

export function buildScanMetaFromEndpoint(
  endpoint: ApiEndpoint,
  origin: RequestScanMeta["origin"] = "scanner",
): RequestScanMeta {
  return {
    origin,
    scanKey: scanKeyFromEndpoint(endpoint),
    userLocked: false,
    sourceFile: endpoint.sourceFile,
    framework: endpoint.framework,
    handler: endpoint.handler,
    lineNumber: endpoint.lineNumber,
  };
}
