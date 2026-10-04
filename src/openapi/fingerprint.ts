import { fingerprintEndpoints } from "@/scan-drift/fingerprint";
import type { ApiEndpoint } from "@/scanner/models/endpoint";

export function fingerprintSpecEndpoints(endpoints: ApiEndpoint[]): string {
  return fingerprintEndpoints(endpoints);
}
