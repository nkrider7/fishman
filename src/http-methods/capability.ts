import type { ApiResponse } from "@/types/response";
import type { QueryHostCapability, QuerySupportStatus } from "./types";

const STORAGE_KEY = "fishman.query-capabilities";

function normalizeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function readCache(): Record<string, QueryHostCapability> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, QueryHostCapability>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, QueryHostCapability>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota / private mode
  }
}

function parseCsvHeader(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * Inspect Allow / Accept-Query (RFC 10008) and status codes to infer QUERY support.
 */
export function detectQuerySupport(
  url: string,
  response: ApiResponse,
  requestedMethod: string,
): QueryHostCapability | null {
  const host = normalizeHost(url);
  if (!host) return null;

  const allow = parseCsvHeader(headerValue(response.headers, "allow")).map((m) =>
    m.toUpperCase(),
  );
  const acceptQuery = parseCsvHeader(
    headerValue(response.headers, "accept-query"),
  );

  let status: QuerySupportStatus = "unknown";

  if (allow.includes("QUERY") || acceptQuery.length > 0) {
    status = "supported";
  } else if (
    requestedMethod.toUpperCase() === "QUERY" &&
    (response.status === 405 || response.status === 501)
  ) {
    status = "rejected";
  } else if (requestedMethod.toUpperCase() === "QUERY" && response.status > 0 && !response.error) {
    // Successful QUERY response implies the server accepted the method
    if (response.status < 400) {
      status = "supported";
    } else if (allow.length > 0 && !allow.includes("QUERY")) {
      status = "not_advertised";
    }
  } else if (allow.length > 0 && !allow.includes("QUERY")) {
    status = "not_advertised";
  }

  const capability: QueryHostCapability = {
    host,
    status,
    allowedMethods: allow,
    acceptQueryMediaTypes: acceptQuery,
    updatedAt: Date.now(),
    lastStatusCode: response.status,
  };

  const cache = readCache();
  cache[host] = capability;
  writeCache(cache);
  return capability;
}

export function getCachedQueryCapability(url: string): QueryHostCapability | null {
  const host = normalizeHost(url);
  if (!host) return null;
  return readCache()[host] ?? null;
}

export function clearQueryCapabilityCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function querySupportLabel(status: QuerySupportStatus): string {
  switch (status) {
    case "supported":
      return "Server supports QUERY";
    case "rejected":
      return "Server rejected QUERY";
    case "not_advertised":
      return "QUERY not advertised";
    default:
      return "QUERY support unknown";
  }
}

export type QueryFallbackMethod = "POST" | "GET";

export function shouldOfferQueryFallback(
  requestedMethod: string,
  response: ApiResponse,
): boolean {
  if (requestedMethod.toUpperCase() !== "QUERY") return false;
  if (response.status === 405 || response.status === 501) return true;
  if (response.error && /method|not allowed|not implemented/i.test(response.error)) {
    return true;
  }
  return false;
}
