import type { CollectionExportData } from "@/import-export/core/types";
import type { RequestDraft } from "@/types/request";
import type {
  DocsGenerateOptions,
  OpenCollectionDocument,
  OpenCollectionHttp,
  OpenCollectionItem,
} from "./types";

function enabledPairs(
  rows: Array<{ key: string; value: string; enabled: boolean }>,
): Array<{ key: string; value: string }> {
  return rows
    .filter((r) => r.enabled && r.key.trim())
    .map((r) => ({ key: r.key, value: r.value }));
}

function redactAuth(draft: RequestDraft): string | Record<string, unknown> {
  const type = draft.auth?.type ?? "none";
  if (type === "none" || type === "inherit") return type === "inherit" ? "inherit" : "none";
  // Never include secret values in generated docs.
  return { type };
}

function mapBody(draft: RequestDraft): OpenCollectionHttp["body"] | undefined {
  if (draft.bodyType === "none") return undefined;
  if (draft.bodyType === "json") {
    return { type: "json", data: draft.body || "" };
  }
  if (draft.bodyType === "xml" || draft.bodyType === "html" || draft.bodyType === "raw") {
    return { type: "text", data: draft.body || "" };
  }
  if (draft.bodyType === "graphql") {
    return { type: "graphql", data: draft.body || "" };
  }
  if (draft.bodyType === "x-www-form-urlencoded") {
    return { type: "formUrlEncoded", data: draft.body || "" };
  }
  if (draft.bodyType === "form-data") {
    const data = draft.formDataFields
      .filter((f) => f.enabled && f.key)
      .map((f) => `${f.key}=${f.type === "file" ? "[file]" : f.value}`)
      .join("\n");
    return { type: "multipartForm", data };
  }
  return { type: "text", data: draft.body || "" };
}

function mapHttp(draft: RequestDraft): OpenCollectionHttp {
  const params = enabledPairs(draft.params).map((p) => ({
    name: p.key,
    value: p.value,
    type: "query" as const,
  }));
  const headers = enabledPairs(draft.headers).map((h) => ({
    name: h.key,
    value: h.value,
  }));

  const http: OpenCollectionHttp = {
    method: draft.method,
    url: draft.url || "",
    auth: redactAuth(draft),
  };
  if (params.length) http.params = params;
  if (headers.length) http.headers = headers;
  const body = mapBody(draft);
  if (body) http.body = body;
  return http;
}

function mapRequest(
  draft: RequestDraft,
  seq: number,
): OpenCollectionItem {
  const scripts = draft.scripts;
  const hasScripts =
    !!scripts?.preRequest?.trim() ||
    !!scripts?.postResponse?.trim() ||
    !!scripts?.tests?.trim();

  const item: OpenCollectionItem = {
    info: {
      name: draft.name || "Untitled Request",
      type: "http",
      seq,
    },
    http: mapHttp(draft),
  };

  if (hasScripts) {
    item.runtime = {
      scripts: {
        ...(scripts.preRequest?.trim()
          ? { preRequest: scripts.preRequest }
          : {}),
        ...(scripts.postResponse?.trim()
          ? { postResponse: scripts.postResponse }
          : {}),
        ...(scripts.tests?.trim() ? { tests: scripts.tests } : {}),
      },
    };
  }

  return item;
}

/**
 * Map Fishman export data → OpenCollection document (KitBag / Bruno docs schema).
 */
export function mapCollectionToOpenCollection(
  data: CollectionExportData,
  _options: DocsGenerateOptions = {},
): OpenCollectionDocument {
  const rootId = data.rootFolder.id;
  const foldersByParent = new Map<string | null, typeof data.folders>();

  for (const folder of data.folders) {
    if (folder.id === rootId) continue;
    const parent = folder.parent_id;
    const list = foldersByParent.get(parent) ?? [];
    list.push(folder);
    foldersByParent.set(parent, list);
  }

  const requestsByFolder = new Map<string, typeof data.requests>();
  for (const req of data.requests) {
    const list = requestsByFolder.get(req.collection_id) ?? [];
    list.push(req);
    requestsByFolder.set(req.collection_id, list);
  }

  const buildFolderItems = (folderId: string): OpenCollectionItem[] => {
    const childFolders = [...(foldersByParent.get(folderId) ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
    );
    const childRequests = [...(requestsByFolder.get(folderId) ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order || a.draft.name.localeCompare(b.draft.name),
    );

    const items: OpenCollectionItem[] = [];
    let seq = 1;

    for (const folder of childFolders) {
      const nested = buildFolderItems(folder.id);
      items.push({
        info: {
          name: folder.name,
          type: "folder",
          seq: seq++,
        },
        request: { auth: "inherit" },
        ...(folder.description?.trim()
          ? { docs: folder.description.trim() }
          : {}),
        items: nested,
      });
    }

    for (const req of childRequests) {
      items.push(mapRequest(req.draft, seq++));
    }

    return items;
  };

  // Root-level requests + folders
  const rootItems = buildFolderItems(rootId);

  return {
    opencollection: "1.0.0",
    info: {
      name: data.rootFolder.name,
      ...(data.rootFolder.description?.trim()
        ? { description: data.rootFolder.description.trim() }
        : {}),
    },
    config: {
      environments: [],
    },
    items: rootItems,
    extensions: {
      fishman: {
        exportedAt: new Date().toISOString(),
        exportedUsing: "Fishman",
      },
    },
  };
}
