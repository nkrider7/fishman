import { importCollection } from "@/services/dbService";
import type { ImportResult } from "@/import-export/core/types";
import { buildCollectionFromEndpoints } from "../builders/collection-builder";
import type { ApiEndpoint } from "../models/endpoint";
import type { ScanResult } from "../models/scan-result";

export async function importScannedEndpoints(
  result: ScanResult,
  options: {
    collectionName: string;
    baseUrl?: string;
    selectedEndpointIds?: string[];
    workspaceId?: string;
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

  const importData: ImportResult = {
    rootFolder: collection.rootFolder,
    folders: collection.folders,
    requests: collection.requests.map(({ endpoint: _endpoint, ...request }) => request),
  };

  return importCollection(importData, {
    workspaceId: options.workspaceId,
  });
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
