import type { ApiEndpoint } from "@/scanner/models/endpoint";
import { endpointToRequestDraft } from "@/scanner/builders/collection-builder";
import type { RequestDraft } from "@/types/request";
import { buildScanMetaFromEndpoint } from "./identity";
import { extractPathFromUrl } from "./normalize";
import type {
  DriftItem,
  DriftReport,
  SyncAction,
  SyncOptions,
  SyncPlan,
} from "./types";
import { DEFAULT_ARCHIVE_FOLDER } from "./types";

/**
 * Build a surgical sync plan from selected drift items.
 * Pure — does not touch the database or filesystem.
 */
export function buildSyncPlan(
  report: DriftReport,
  selectedItemIds: string[],
  options: SyncOptions = {},
): SyncPlan {
  const selected = new Set(selectedItemIds);
  const archiveFolderName =
    options.archiveFolderName?.trim() || DEFAULT_ARCHIVE_FOLDER;
  const actions: SyncAction[] = [];
  const warnings: string[] = [];

  for (const item of report.items) {
    if (!selected.has(item.id)) continue;

    switch (item.kind) {
      case "added": {
        if (!item.endpoint) {
          warnings.push(`Skipped added item without endpoint: ${item.scanKey}`);
          break;
        }
        const draft = endpointToSyncedDraft(item.endpoint, report);
        actions.push({
          kind: "create",
          itemId: item.id,
          scanKey: item.scanKey,
          endpoint: item.endpoint,
          draft,
          folderPath:
            item.endpoint.folder.length > 0
              ? item.endpoint.folder
              : ["General"],
        });
        break;
      }
      case "changed": {
        if (!item.endpoint || !item.draft || !item.requestId) {
          warnings.push(`Skipped changed item: ${item.scanKey}`);
          break;
        }
        if (item.locked && !options.overwriteLocked) {
          actions.push({
            kind: "skip",
            itemId: item.id,
            scanKey: item.scanKey,
            requestId: item.requestId,
            reason: "Request is locked",
          });
          break;
        }
        const draft = mergeEndpointIntoDraft(item.draft, item.endpoint, report);
        actions.push({
          kind: "update",
          itemId: item.id,
          scanKey: item.scanKey,
          requestId: item.requestId,
          endpoint: item.endpoint,
          draft,
        });
        break;
      }
      case "removed": {
        if (!item.requestId) {
          warnings.push(`Skipped removed item: ${item.scanKey}`);
          break;
        }
        actions.push({
          kind: options.hardDeleteRemoved ? "delete" : "archive",
          itemId: item.id,
          scanKey: item.scanKey,
          requestId: item.requestId,
          draft: item.draft,
        });
        break;
      }
      case "manual_only":
      case "unchanged":
        actions.push({
          kind: "skip",
          itemId: item.id,
          scanKey: item.scanKey,
          requestId: item.requestId,
          reason: `Kind ${item.kind} is not syncable`,
        });
        break;
    }
  }

  return { actions, archiveFolderName, warnings };
}

/** Select “safe” items: added + unlocked changed (excludes removed). */
export function selectSafeSyncIds(report: DriftReport): string[] {
  return report.items
    .filter(
      (item) =>
        item.kind === "added" ||
        (item.kind === "changed" && !item.locked),
    )
    .map((item) => item.id);
}

export function selectSyncableIds(
  report: DriftReport,
  kinds: Array<DriftItem["kind"]>,
): string[] {
  const set = new Set(kinds);
  return report.items.filter((i) => set.has(i.kind)).map((i) => i.id);
}

function endpointToSyncedDraft(
  endpoint: ApiEndpoint,
  _report: DriftReport,
): RequestDraft {
  return endpointToSyncedDraftWithBase(endpoint, undefined);
}

/** Prefer ScanLink baseUrl when creating new requests during apply. */
export function endpointToSyncedDraftWithBase(
  endpoint: ApiEndpoint,
  baseUrl?: string,
): RequestDraft {
  const draft = endpointToRequestDraft(endpoint, baseUrl);
  return {
    ...draft,
    scan: buildScanMetaFromEndpoint(endpoint),
  };
}

/**
 * Merge scanned endpoint fields into an existing draft while preserving
 * user scripts, locked flag, and user-added headers.
 */
export function mergeEndpointIntoDraft(
  existing: RequestDraft,
  endpoint: ApiEndpoint,
  report: DriftReport,
): RequestDraft {
  const baseUrl = inferBaseUrl(existing.url, report);
  const path = endpoint.path.startsWith("/")
    ? endpoint.path
    : `/${endpoint.path}`;
  const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;

  const scanHeaders = new Map(
    endpoint.headers.map((h) => [h.name.toLowerCase(), h]),
  );
  const preservedHeaders = existing.headers.filter(
    (h) => h.key.trim() && !scanHeaders.has(h.key.trim().toLowerCase()),
  );
  const nextHeaders = [
    ...endpoint.headers.map((h, i) => ({
      id: `h-${i}`,
      key: h.name,
      value: String(h.example ?? ""),
      enabled: true,
    })),
    ...preservedHeaders,
  ];

  if (endpoint.requestBody?.contentType) {
    const hasCt = nextHeaders.some(
      (h) => h.key.toLowerCase() === "content-type",
    );
    if (!hasCt) {
      nextHeaders.push({
        id: "content-type",
        key: "Content-Type",
        value: endpoint.requestBody.contentType,
        enabled: true,
      });
    }
  }

  const nextParams = endpoint.queryParameters.map((p, i) => ({
    id: `q-${i}`,
    key: p.name,
    value: String(p.example ?? ""),
    enabled: true,
  }));

  let bodyType = existing.bodyType;
  let body = existing.body;
  if (endpoint.requestBody) {
    const example =
      endpoint.requestBody.example ?? endpoint.requestBody.raw ?? "";
    if (endpoint.requestBody.contentType.includes("multipart")) {
      bodyType = "form-data";
    } else if (
      endpoint.requestBody.contentType.includes("x-www-form-urlencoded")
    ) {
      bodyType = "x-www-form-urlencoded";
      body = example || body;
    } else {
      bodyType = "json";
      body = example || body;
    }
  }

  let auth = existing.auth;
  if (endpoint.authentication?.required) {
    const t = endpoint.authentication.type;
    if (t === "bearer") {
      auth = { type: "bearer", bearer: existing.auth.bearer ?? { token: "{{token}}" } };
    } else if (t === "basic") {
      auth = {
        type: "basic",
        basic: existing.auth.basic ?? { username: "", password: "" },
      };
    } else if (t === "apikey") {
      auth = {
        type: "apikey",
        apikey: existing.auth.apikey ?? {
          key: "X-API-Key",
          value: "{{api_key}}",
          addTo: "header",
        },
      };
    }
  }

  return {
    ...existing,
    name: endpoint.name || existing.name,
    method: endpoint.method,
    url,
    params: nextParams,
    headers: nextHeaders,
    bodyType,
    body,
    auth,
    // Preserve scripts always
    scripts: existing.scripts,
    scan: {
      ...buildScanMetaFromEndpoint(endpoint),
      userLocked: existing.scan?.userLocked,
    },
  };
}

function inferBaseUrl(url: string, report: DriftReport): string | undefined {
  // Prefer ScanLink baseUrl when apply layer passes it via report warnings/meta — use URL prefix.
  const trimmed = url.trim();
  const path = extractPathFromUrl(trimmed);
  if (trimmed.startsWith("{{")) {
    const m = trimmed.match(/^(\{\{[^}]+\}\})/);
    return m?.[1];
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return `${u.protocol}//${u.host}`;
    } catch {
      return undefined;
    }
  }
  if (path !== "/" && trimmed.endsWith(path)) {
    return trimmed.slice(0, trimmed.length - path.length) || undefined;
  }
  void report;
  return undefined;
}
