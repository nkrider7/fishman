import type { CollectionFolder, SavedRequest } from "@/types/collection";
import { parseFolderSettings } from "@/types/collection";
import type { Environment } from "@/types/environment";
import type { KeyValue, RequestDraft } from "@/types/request";
import { deserializeBodyFromStorage } from "@/types/request";
import {
  applyFieldReplace,
  findTextMatch,
  findUrlMatch,
} from "./replace-urls";
import type {
  UrlReplaceField,
  UrlReplaceMatch,
  UrlReplaceMatchKind,
  UrlReplaceOptions,
  UrlReplaceScope,
} from "./types";

export function collectDescendantFolderIds(
  rootId: string,
  folders: CollectionFolder[],
): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parent_id && ids.has(folder.parent_id) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function folderBreadcrumb(
  folderId: string | null | undefined,
  folders: CollectionFolder[],
): string {
  if (!folderId) return "";
  const parts: string[] = [];
  let current = folders.find((f) => f.id === folderId);
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id
      ? folders.find((f) => f.id === current!.parent_id)
      : undefined;
  }
  return parts.join(" / ");
}

function isFilesystemFolder(
  folderId: string | null | undefined,
  folders: CollectionFolder[],
): boolean {
  if (!folderId) return false;
  let current = folders.find((f) => f.id === folderId);
  while (current) {
    if (
      current.source_kind === "filesystem" ||
      current.source?.kind === "filesystem"
    ) {
      return true;
    }
    if (!current.parent_id) break;
    current = folders.find((f) => f.id === current!.parent_id);
  }
  return false;
}

export interface ScanContext {
  folders: CollectionFolder[];
  requests: SavedRequest[];
  environments: Environment[];
  openDrafts: Record<string, RequestDraft>;
  tabs: Array<{
    id: string;
    title: string;
    requestId?: string | null;
    kind?: string;
  }>;
}

function requestIdsInScope(
  scope: UrlReplaceScope,
  folders: CollectionFolder[],
  requests: SavedRequest[],
  tabs: ScanContext["tabs"],
): Set<string> | "all" {
  if (scope.kind === "workspace") return "all";
  if (scope.kind === "selected") {
    return new Set(scope.requestIds ?? []);
  }
  if (scope.kind === "open-tabs") {
    const ids = new Set<string>();
    for (const tab of tabs) {
      if (tab.kind && tab.kind !== "request") continue;
      if (tab.requestId) ids.add(tab.requestId);
    }
    return ids;
  }
  if (scope.kind === "collection" || scope.kind === "folder") {
    const root = scope.folderId;
    if (!root) return new Set();
    const folderIds = collectDescendantFolderIds(root, folders);
    return new Set(
      requests
        .filter((r) => r.collection_id && folderIds.has(r.collection_id))
        .map((r) => r.id),
    );
  }
  return new Set();
}

function folderIdsInScope(
  scope: UrlReplaceScope,
  folders: CollectionFolder[],
): Set<string> | "all" {
  if (scope.kind === "workspace") return "all";
  if (scope.kind === "open-tabs" || scope.kind === "selected") return new Set();
  if (scope.kind === "collection" || scope.kind === "folder") {
    const root = scope.folderId;
    if (!root) return new Set();
    return collectDescendantFolderIds(root, folders);
  }
  return new Set();
}

function parseParams(raw: string | undefined): KeyValue[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as KeyValue[]) : [];
  } catch {
    return [];
  }
}

function bodyTextFromRow(row: SavedRequest): string {
  if (row.body_type === "none" || row.body_type === "binary") return "";
  const bodyType = row.body_type as RequestDraft["bodyType"];
  const { body, graphql } = deserializeBodyFromStorage(
    bodyType,
    row.body_json || "",
  );
  if (bodyType === "graphql" && graphql) {
    return [graphql.query ?? "", graphql.variables ?? ""]
      .filter(Boolean)
      .join("\n");
  }
  return body || "";
}

type Hit = {
  before: string;
  after: string;
  matchStart: number;
  matchLength: number;
  occurrenceCount: number;
};

function matchField(
  text: string,
  find: string,
  replace: string,
  field: UrlReplaceField,
  options: UrlReplaceOptions,
): Hit | null {
  const findTrim = find.trim();
  if (!findTrim || !text) return null;
  const replaceTrim = replace.trim();
  const canApply = Boolean(replaceTrim) && replaceTrim !== findTrim;
  const opts = {
    matchCase: options.matchCase,
    wholeOrigin: options.wholeOrigin,
  };

  if (field === "url" || field === "folder-base" || field === "open-tab") {
    if (options.wholeOrigin) {
      const hit = findUrlMatch(text, findTrim, opts);
      if (!hit) return null;
      if (!canApply) {
        return {
          before: text,
          after: text,
          matchStart: hit.matchStart,
          matchLength: hit.matchLength,
          occurrenceCount: 1,
        };
      }
      const applied = applyFieldReplace(text, findTrim, replaceTrim, field, opts);
      if (!applied) {
        return {
          before: text,
          after: text,
          matchStart: hit.matchStart,
          matchLength: hit.matchLength,
          occurrenceCount: 1,
        };
      }
      return {
        before: text,
        after: applied.next,
        matchStart: applied.matchStart,
        matchLength: applied.matchLength,
        occurrenceCount: applied.count,
      };
    }
  }

  // Literal (body / param / url without whole-origin)
  const hit = findTextMatch(text, findTrim, options.matchCase);
  if (!hit) return null;
  if (!canApply) {
    return {
      before: text,
      after: text,
      matchStart: hit.matchStart,
      matchLength: hit.matchLength,
      occurrenceCount: hit.count,
    };
  }
  const applied = applyFieldReplace(text, findTrim, replaceTrim, field, {
    matchCase: options.matchCase,
    wholeOrigin: false,
  });
  if (!applied) {
    return {
      before: text,
      after: text,
      matchStart: hit.matchStart,
      matchLength: hit.matchLength,
      occurrenceCount: hit.count,
    };
  }
  return {
    before: text,
    after: applied.next,
    matchStart: hit.matchStart,
    matchLength: Math.min(applied.matchLength, applied.next.length),
    occurrenceCount: applied.count,
  };
}

function pushMatch(
  matches: UrlReplaceMatch[],
  partial: Omit<UrlReplaceMatch, "selected" | "occurrenceCount"> & {
    occurrenceCount?: number;
  },
): void {
  matches.push({
    selected: true,
    occurrenceCount: partial.occurrenceCount ?? 1,
    ...partial,
  });
}

/**
 * Build preview matches for find→replace across URLs, bodies, and params.
 */
export function buildUrlReplaceMatches(
  find: string,
  replace: string,
  scope: UrlReplaceScope,
  options: UrlReplaceOptions,
  ctx: ScanContext,
): UrlReplaceMatch[] {
  const matches: UrlReplaceMatch[] = [];
  const findTrim = find.trim();
  if (!findTrim) return matches;

  const reqScope = requestIdsInScope(
    scope,
    ctx.folders,
    ctx.requests,
    ctx.tabs,
  );

  for (const row of ctx.requests) {
    if (reqScope !== "all" && !reqScope.has(row.id)) continue;

    const crumb = folderBreadcrumb(row.collection_id, ctx.folders);
    const fs = isFilesystemFolder(row.collection_id, ctx.folders);
    const isWs = row.protocol === "websocket";

    if (options.includeUrl) {
      const hit = matchField(
        row.url,
        find,
        replace,
        "url",
        options,
      );
      if (hit) {
        pushMatch(matches, {
          id: `url:${row.id}`,
          kind: isWs ? "websocket" : "request-url",
          field: "url",
          targetId: row.id,
          name: row.name,
          method: isWs ? "WS" : row.method,
          breadcrumb: crumb,
          before: hit.before,
          after: hit.after,
          matchStart: hit.matchStart,
          matchLength: hit.matchLength,
          occurrenceCount: hit.occurrenceCount,
          filesystem: fs,
        });
      }
    }

    if (options.includeBody && !isWs) {
      const body = bodyTextFromRow(row);
      const hit = matchField(body, find, replace, "body", options);
      if (hit) {
        pushMatch(matches, {
          id: `body:${row.id}`,
          kind: "request-body",
          field: "body",
          targetId: row.id,
          name: row.name,
          method: row.method,
          breadcrumb: crumb,
          before: hit.before,
          after: hit.after,
          matchStart: hit.matchStart,
          matchLength: hit.matchLength,
          occurrenceCount: hit.occurrenceCount,
          filesystem: fs,
        });
      }
    }

    if (options.includeParams && !isWs) {
      const params = parseParams(row.params_json);
      for (const param of params) {
        for (const part of ["key", "value"] as const) {
          const text = part === "key" ? param.key : param.value;
          const hit = matchField(text, find, replace, "param", options);
          if (!hit) continue;
          pushMatch(matches, {
            id: `param:${row.id}:${param.id}:${part}`,
            kind: "request-param",
            field: "param",
            targetId: row.id,
            variableId: param.id,
            paramPart: part,
            name: row.name,
            method: row.method,
            breadcrumb: crumb,
            before: hit.before,
            after: hit.after,
            matchStart: hit.matchStart,
            matchLength: hit.matchLength,
            occurrenceCount: hit.occurrenceCount,
            filesystem: fs,
          });
        }
      }
    }
  }

  if (options.includeFolderBaseUrl) {
    const folderScope = folderIdsInScope(scope, ctx.folders);
    for (const folder of ctx.folders) {
      if (folderScope !== "all" && !folderScope.has(folder.id)) continue;
      const base = parseFolderSettings(folder).presets.baseUrl;
      if (!base) continue;
      const hit = matchField(base, find, replace, "folder-base", options);
      if (!hit) continue;
      pushMatch(matches, {
        id: `folder:${folder.id}`,
        kind: "folder-base",
        field: "folder-base",
        targetId: folder.id,
        name: `${folder.name} (base URL)`,
        breadcrumb: folderBreadcrumb(folder.id, ctx.folders),
        before: hit.before,
        after: hit.after,
        matchStart: hit.matchStart,
        matchLength: hit.matchLength,
        occurrenceCount: hit.occurrenceCount,
        filesystem: isFilesystemFolder(folder.id, ctx.folders),
      });
    }
  }

  if (options.includeEnvironmentVariables) {
    const envAllowed =
      scope.kind === "workspace" ||
      scope.kind === "collection" ||
      scope.kind === "folder";
    const folderScopeForEnv =
      scope.kind === "collection" || scope.kind === "folder"
        ? scope.folderId
          ? collectDescendantFolderIds(scope.folderId, ctx.folders)
          : new Set<string>()
        : null;

    for (const env of ctx.environments) {
      if (!envAllowed) continue;
      if (
        folderScopeForEnv &&
        env.collection_id &&
        !folderScopeForEnv.has(env.collection_id)
      ) {
        continue;
      }
      for (const variable of env.variables) {
        if (!variable.value) continue;
        const hit = matchField(
          variable.value,
          find,
          replace,
          "env-var",
          options,
        );
        if (!hit) continue;
        pushMatch(matches, {
          id: `env:${env.id}:${variable.id}`,
          kind: "env-var",
          field: "env-var",
          targetId: env.id,
          variableId: variable.id,
          name: `${env.name} · ${variable.key}`,
          breadcrumb: env.collection_id
            ? folderBreadcrumb(env.collection_id, ctx.folders) ||
              "Collection env"
            : "Global",
          before: hit.before,
          after: hit.after,
          matchStart: hit.matchStart,
          matchLength: hit.matchLength,
          occurrenceCount: hit.occurrenceCount,
        });
      }
    }
  }

  if (options.includeOpenTabs) {
    const seenUrlIds = new Set(
      matches.filter((m) => m.field === "url").map((m) => m.targetId),
    );

    for (const tab of ctx.tabs) {
      if (tab.kind && tab.kind !== "request") continue;
      const draft = ctx.openDrafts[tab.id];
      if (!draft) continue;

      if (scope.kind === "selected") {
        if (!tab.requestId || !scope.requestIds?.includes(tab.requestId)) {
          continue;
        }
      } else if (scope.kind === "collection" || scope.kind === "folder") {
        if (!tab.requestId) continue;
        if (reqScope !== "all" && !reqScope.has(tab.requestId)) continue;
      }

      if (options.includeUrl && draft.url) {
        if (tab.requestId && seenUrlIds.has(tab.requestId)) {
          const saved = ctx.requests.find((r) => r.id === tab.requestId);
          if (saved && saved.url === draft.url) {
            // skip duplicate
          } else {
            const hit = matchField(draft.url, find, replace, "open-tab", options);
            if (hit) {
              pushMatch(matches, {
                id: `tab-url:${tab.id}`,
                kind: "open-tab",
                field: "open-tab",
                targetId: tab.id,
                name: tab.title || draft.name || "Untitled",
                method: draft.method,
                breadcrumb: "Open tab · URL",
                before: hit.before,
                after: hit.after,
                matchStart: hit.matchStart,
                matchLength: hit.matchLength,
                occurrenceCount: hit.occurrenceCount,
              });
            }
          }
        } else if (!tab.requestId || !seenUrlIds.has(tab.requestId)) {
          const hit = matchField(draft.url, find, replace, "open-tab", options);
          if (hit) {
            pushMatch(matches, {
              id: `tab-url:${tab.id}`,
              kind: "open-tab",
              field: "open-tab",
              targetId: tab.id,
              name: tab.title || draft.name || "Untitled",
              method: draft.method,
              breadcrumb: "Open tab · URL",
              before: hit.before,
              after: hit.after,
              matchStart: hit.matchStart,
              matchLength: hit.matchLength,
              occurrenceCount: hit.occurrenceCount,
            });
          }
        }
      }

      if (options.includeBody && draft.body) {
        const hit = matchField(draft.body, find, replace, "body", options);
        if (hit) {
          // Avoid dup if same as saved body match and identical
          const savedBodyId = tab.requestId ? `body:${tab.requestId}` : null;
          const already = savedBodyId
            ? matches.find((m) => m.id === savedBodyId)
            : null;
          if (!already || already.before !== draft.body) {
            pushMatch(matches, {
              id: `tab-body:${tab.id}`,
              kind: "request-body",
              field: "body",
              targetId: tab.id,
              name: tab.title || draft.name || "Untitled",
              method: draft.method,
              breadcrumb: "Open tab · Body",
              before: hit.before,
              after: hit.after,
              matchStart: hit.matchStart,
              matchLength: hit.matchLength,
              occurrenceCount: hit.occurrenceCount,
            });
          }
        }
      }
    }
  }

  return matches;
}

export function urlsFromScanContext(ctx: ScanContext): string[] {
  const urls: string[] = [];
  for (const r of ctx.requests) urls.push(r.url);
  for (const f of ctx.folders) {
    const base = parseFolderSettings(f).presets.baseUrl;
    if (base) urls.push(base);
  }
  for (const e of ctx.environments) {
    for (const v of e.variables) {
      if (v.value) urls.push(v.value);
    }
  }
  for (const draft of Object.values(ctx.openDrafts)) {
    if (draft.url) urls.push(draft.url);
  }
  return urls;
}

export function fieldLabel(field: UrlReplaceField): string {
  switch (field) {
    case "url":
      return "URL";
    case "body":
      return "Body";
    case "param":
      return "Params";
    case "folder-base":
      return "Folder base";
    case "env-var":
      return "Environment";
    case "open-tab":
      return "Open tab";
    default:
      return field;
  }
}

export function groupMatchesByField(
  matches: UrlReplaceMatch[],
): Array<{ field: UrlReplaceField; label: string; matches: UrlReplaceMatch[] }> {
  const order: UrlReplaceField[] = [
    "url",
    "param",
    "body",
    "open-tab",
    "folder-base",
    "env-var",
  ];
  const map = new Map<UrlReplaceField, UrlReplaceMatch[]>();
  for (const m of matches) {
    const list = map.get(m.field) ?? [];
    list.push(m);
    map.set(m.field, list);
  }
  return order
    .filter((f) => (map.get(f)?.length ?? 0) > 0)
    .map((field) => ({
      field,
      label: fieldLabel(field),
      matches: map.get(field)!,
    }));
}

// Keep type export used by older tests
export type { UrlReplaceMatchKind };
