import { importCollection, getCollections, deleteFolder } from "@/services/dbService";
import type { ImportResult } from "@/import-export/core/types";
import { prepareImportWithStrategy } from "@/import-export/core/conflict";
import { buildCollectionFromEndpoints } from "../builders/collection-builder";
import type { ApiEndpoint } from "../models/endpoint";
import type { ScanResult } from "../models/scan-result";
import { fingerprintEndpoints } from "@/scan-drift/fingerprint";
import { upsertScanLink } from "@/scan-drift/scan-link-store";
import type { ScanLink } from "@/scan-drift/types";

export async function importScannedEndpoints(
  result: ScanResult,
  options: {
    collectionName: string;
    baseUrl?: string;
    selectedEndpointIds?: string[];
    workspaceId?: string;
    /** Default `replace` so re-scanning the same project updates instead of duplicating. */
    conflictStrategy?: "replace" | "duplicate" | "merge" | "skip";
    /** Local absolute path or omit for GitHub-only links. */
    projectPath?: string | null;
    githubUrl?: string;
    githubRef?: string;
    source?: "local" | "github";
  },
) {
  const selectedSet = options.selectedEndpointIds
    ? new Set(options.selectedEndpointIds)
    : undefined;

  const collection = buildCollectionFromEndpoints(result.endpoints, {
    collectionName: options.collectionName,
    baseUrl: options.baseUrl,
    selectedEndpointIds: selectedSet,
  });

  // Root is inserted separately — never include it (or other null-parent rows) in folders.
  const childFolders = collection.folders.filter(
    (folder) =>
      folder.id !== collection.rootFolder.id && folder.parent_id != null,
  );

  const importData: ImportResult = {
    rootFolder: collection.rootFolder,
    folders: childFolders,
    requests: collection.requests.map(({ endpoint: _endpoint, ...request }) => request),
  };

  const workspaceId = options.workspaceId;
  const existing = await getCollections(workspaceId);
  const strategy = options.conflictStrategy ?? "replace";

  // Wipe every same-named root (not just the first) so prior duplicate imports
  // don't leave sibling "backend-server API" folders behind.
  if (strategy === "replace") {
    const conflicts = existing.filter(
      (folder) => !folder.parent_id && folder.name === importData.rootFolder.name,
    );
    for (const conflict of conflicts) {
      await deleteFolder(conflict.id);
    }
  }

  const remaining = strategy === "replace" ? await getCollections(workspaceId) : existing;
  const prepared = prepareImportWithStrategy(importData, remaining, strategy);
  if (!prepared) {
    return { folders: [], requests: [], scanLink: null as ScanLink | null };
  }

  const imported = await importCollection(prepared.data, {
    ...prepared.options,
    workspaceId,
  });

  const rootId =
    imported.folders.find((f) => !f.parent_id)?.id ??
    collection.rootFolder.id;

  const selectedEndpoints = selectedSet
    ? result.endpoints.filter((ep) => selectedSet.has(ep.id))
    : result.endpoints;

  const source =
    options.source ??
    (options.githubUrl ? "github" : "local");

  const scanLink = await upsertScanLink({
    collectionRootId: rootId,
    source,
    projectPath: options.projectPath ?? undefined,
    githubUrl: options.githubUrl,
    githubRef: options.githubRef,
    language: result.language,
    frameworks: result.frameworks,
    lastScanAt: Date.now(),
    lastScanFingerprint: fingerprintEndpoints(selectedEndpoints),
    baseUrl: options.baseUrl,
    watchEnabled: false,
    collectionName: options.collectionName,
  });

  return { ...imported, scanLink };
}

export function groupEndpointsByFolder(
  endpoints: ApiEndpoint[],
): Map<string, ApiEndpoint[]> {
  const groups = new Map<string, ApiEndpoint[]>();
  for (const ep of endpoints) {
    const key = ep.folder.join("/") || "General";
    const list = groups.get(key) ?? [];
    list.push(ep);
    groups.set(key, list);
  }
  return groups;
}
