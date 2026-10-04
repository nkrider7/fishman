import type { ApiEndpoint } from "@/scanner/models/endpoint";
import type { RequestDraft } from "@/types/request";
import { extractPathFromUrl, normalizeMethod, normalizePath } from "./normalize";
import { scanKeyFromDraft, scanKeyFromEndpoint } from "./identity";
import { matchRequestsToEndpoints } from "./match";
import type {
  CollectionRequestRef,
  DriftFieldChange,
  DriftItem,
  DriftReport,
  DriftSummary,
} from "./types";

export interface BuildDriftReportInput {
  collectionRootId: string;
  projectLabel: string;
  requests: CollectionRequestRef[];
  endpoints: ApiEndpoint[];
  warnings?: string[];
  scanResultMeta: DriftReport["scanResultMeta"];
  scannedAt?: number;
}

export function buildDriftReport(input: BuildDriftReportInput): DriftReport {
  const pairs = matchRequestsToEndpoints(input.requests, input.endpoints);
  const items: DriftItem[] = [];

  for (const pair of pairs) {
    const { endpoint, request, scanKey } = pair;

    if (endpoint && !request) {
      items.push({
        id: `added:${scanKey}:${endpoint.id}`,
        kind: "added",
        scanKey,
        method: endpoint.method,
        path: normalizePath(endpoint.path),
        name: endpoint.name,
        sourceFile: endpoint.sourceFile,
        summary: "New route in code — not in collection",
        endpoint,
      });
      continue;
    }

    if (request && !endpoint) {
      const origin = request.draft.scan?.origin ?? inferOrigin(request.draft);
      if (origin === "manual" || origin === "imported") {
        items.push({
          id: `manual:${scanKey}:${request.id}`,
          kind: "manual_only",
          scanKey,
          method: request.draft.method,
          path: extractPathFromUrl(request.draft.url),
          name: request.draft.name,
          sourceFile: request.draft.scan?.sourceFile,
          summary:
            origin === "imported"
              ? "Imported request — not managed by scanner/OpenAPI"
              : "Manual request — not managed by scanner",
          requestId: request.id,
          draft: request.draft,
        });
      } else {
        const ownedBy =
          origin === "openapi" ? "OpenAPI-owned" : "Scanner-owned";
        items.push({
          id: `removed:${scanKey}:${request.id}`,
          kind: "removed",
          scanKey,
          method: request.draft.method,
          path: extractPathFromUrl(request.draft.url),
          name: request.draft.name,
          sourceFile: request.draft.scan?.sourceFile,
          summary: `${ownedBy} request missing from source`,
          requestId: request.id,
          draft: request.draft,
        });
      }
      continue;
    }

    if (endpoint && request) {
      const locked = Boolean(request.draft.scan?.userLocked);
      const fieldChanges = diffEndpointVsDraft(endpoint, request.draft);
      if (fieldChanges.length === 0) {
        items.push({
          id: `unchanged:${scanKey}:${request.id}`,
          kind: "unchanged",
          scanKey,
          method: endpoint.method,
          path: normalizePath(endpoint.path),
          name: endpoint.name,
          sourceFile: endpoint.sourceFile,
          summary: "In sync",
          endpoint,
          requestId: request.id,
          draft: request.draft,
          locked,
        });
      } else {
        items.push({
          id: `changed:${scanKey}:${request.id}`,
          kind: "changed",
          scanKey,
          method: endpoint.method,
          path: normalizePath(endpoint.path),
          name: endpoint.name,
          sourceFile: endpoint.sourceFile,
          summary: locked
            ? `Changed in code (${fieldChanges.length} fields) — locked`
            : `Changed in code (${fieldChanges.map((c) => c.field).join(", ")})`,
          endpoint,
          requestId: request.id,
          draft: request.draft,
          fieldChanges,
          locked,
        });
      }
    }
  }

  const summary = summarize(items);
  return {
    collectionRootId: input.collectionRootId,
    projectLabel: input.projectLabel,
    scannedAt: input.scannedAt ?? Date.now(),
    summary,
    items,
    warnings: input.warnings ?? [],
    scanResultMeta: input.scanResultMeta,
  };
}

function inferOrigin(draft: RequestDraft): "scanner" | "openapi" | "manual" | "imported" {
  if (draft.scan?.origin) return draft.scan.origin;
  // Legacy heuristic: scanKey stamp implies scanner
  if (draft.scan?.scanKey) return draft.scan.origin ?? "scanner";
  return "manual";
}

function summarize(items: DriftItem[]): DriftSummary {
  const summary: DriftSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    manualOnly: 0,
  };
  for (const item of items) {
    switch (item.kind) {
      case "added":
        summary.added++;
        break;
      case "removed":
        summary.removed++;
        break;
      case "changed":
        summary.changed++;
        break;
      case "unchanged":
        summary.unchanged++;
        break;
      case "manual_only":
        summary.manualOnly++;
        break;
    }
  }
  return summary;
}

/** Meaningful field diffs between a scanned endpoint and an existing draft. */
export function diffEndpointVsDraft(
  endpoint: ApiEndpoint,
  draft: RequestDraft,
): DriftFieldChange[] {
  const changes: DriftFieldChange[] = [];

  const epMethod = normalizeMethod(endpoint.method);
  const draftMethod = normalizeMethod(draft.method);
  if (epMethod !== draftMethod) {
    changes.push({ field: "method", before: draftMethod, after: epMethod });
  }

  const epPath = normalizePath(endpoint.path);
  const draftPath = extractPathFromUrl(draft.url);
  if (epPath !== draftPath) {
    changes.push({ field: "path", before: draftPath, after: epPath });
  }

  // Name is soft — do not treat as a sync-worthy change on its own.
  // (Still available to callers via a future softDiff if needed.)

  const epQuery = new Set(
    endpoint.queryParameters.map((p) => p.name.toLowerCase()).filter(Boolean),
  );
  const draftQuery = new Set(
    draft.params
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => p.key.trim().toLowerCase()),
  );
  if (!sameStringSet(epQuery, draftQuery)) {
    changes.push({
      field: "query",
      before: [...draftQuery].sort().join(", ") || "(none)",
      after: [...epQuery].sort().join(", ") || "(none)",
    });
  }

  const epAuth = endpoint.authentication?.required
    ? String(endpoint.authentication.type)
    : "none";
  const draftAuth = draft.auth?.type ?? "none";
  const normalizedDraftAuth =
    draftAuth === "inherit" ? "none" : draftAuth;
  // Only flag when scanner detected auth and draft differs
  if (endpoint.authentication?.required && epAuth !== normalizedDraftAuth) {
    changes.push({
      field: "auth",
      before: normalizedDraftAuth,
      after: epAuth,
    });
  }

  const epBody = endpoint.requestBody?.example ?? endpoint.requestBody?.raw ?? "";
  const epBodyType = endpoint.requestBody
    ? contentTypeToBodyHint(endpoint.requestBody.contentType)
    : "none";
  if (epBodyType !== "none") {
    if (draft.bodyType === "none" || (epBody && draft.body.trim() !== epBody.trim() && draft.bodyType !== "form-data")) {
      // Soft: only flag when draft has empty/none body but scan has example
      if (!draft.body.trim() && epBody.trim()) {
        changes.push({
          field: "body",
          before: "(empty)",
          after: truncate(epBody, 80),
        });
      } else if (
        draft.bodyType !== "none" &&
        epBody.trim() &&
        normalizeJsonish(draft.body) !== normalizeJsonish(epBody)
      ) {
        changes.push({
          field: "body",
          before: truncate(draft.body, 80),
          after: truncate(epBody, 80),
        });
      }
    }
  }

  // Ensure scanKey identity is consistent (debug aid — shouldn't normally differ)
  const expectedKey = scanKeyFromEndpoint(endpoint);
  const actualKey = scanKeyFromDraft(draft);
  if (expectedKey !== actualKey && changes.every((c) => c.field !== "path" && c.field !== "method")) {
    changes.push({
      field: "scanKey",
      before: actualKey,
      after: expectedKey,
    });
  }

  return changes;
}

function sameStringSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function contentTypeToBodyHint(ct: string): string {
  if (!ct) return "none";
  if (ct.includes("json")) return "json";
  if (ct.includes("multipart")) return "form-data";
  if (ct.includes("x-www-form-urlencoded")) return "x-www-form-urlencoded";
  return "raw";
}

function normalizeJsonish(raw: string): string {
  const t = raw.trim();
  try {
    return JSON.stringify(JSON.parse(t));
  } catch {
    return t;
  }
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
