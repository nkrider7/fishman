import { generateId } from "@/utils/id";
import { parseUrlParts } from "@/utils/urlParts";
import type { NetworkLogEntry } from "@/store/slices/networkLogSlice";

export function buildNetworkLogEntry(input: {
  method: string;
  url: string;
  statusCode?: number | null;
  durationMs?: number | null;
  sizeBytes?: number | null;
  startedAt?: number;
  tabId?: string;
  error?: string;
}): NetworkLogEntry {
  const { domain, path } = parseUrlParts(input.url);
  const durationMs = input.durationMs ?? null;
  const startedAt =
    input.startedAt ??
    (durationMs != null ? Date.now() - durationMs : Date.now());

  return {
    id: generateId(),
    method: input.method || "GET",
    statusCode: input.statusCode ?? null,
    url: input.url,
    domain,
    path,
    startedAt,
    durationMs,
    sizeBytes: input.sizeBytes ?? null,
    tabId: input.tabId,
    error: input.error,
  };
}
