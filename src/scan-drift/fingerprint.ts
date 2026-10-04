import type { ApiEndpoint } from "@/scanner/models/endpoint";
import { scanKeyFromEndpoint } from "./identity";

/** Stable fingerprint of a scan result for quick "anything changed?" checks. */
export function fingerprintEndpoints(endpoints: ApiEndpoint[]): string {
  const keys = endpoints.map(scanKeyFromEndpoint).sort();
  return simpleHash(keys.join("\n"));
}

/** FNV-1a 32-bit style hash → hex (fast, deterministic, no crypto dependency). */
export function simpleHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
