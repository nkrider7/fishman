import type { CollectionFolder, SavedRequest } from "@/types/collection";
import { requestToRow } from "@/services/dbService";
import type { FishFolderNode, FishmanWorkspaceGraph } from "../types";
import { fishRequestToDraft } from "../codec/map-draft";

export interface GraphCollections {
  folders: CollectionFolder[];
  requests: SavedRequest[];
  rootFolderId: string;
}

/**
 * Flatten a Fishman filesystem workspace graph into the Redux collections shape
 * used by CollectionTree (sqlite-compatible rows, not persisted).
 */
export function graphToCollectionTree(
  graph: FishmanWorkspaceGraph,
  options?: { workspaceId?: string },
): GraphCollections {
  const workspaceId = options?.workspaceId ?? "fs-workspace";
  const now = Date.now();
  const folders: CollectionFolder[] = [];
  const requests: SavedRequest[] = [];

  const rootId = graph.workspace.id;
  folders.push({
    id: rootId,
    workspace_id: workspaceId,
    parent_id: null,
    name: graph.workspace.name,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    source_kind: "filesystem",
    source_path: graph.source.rootPath,
    sync_status: graph.source.syncStatus ?? "synced",
    last_synced_at: graph.source.lastSyncedAt ?? now,
    source: {
      kind: "filesystem",
      rootPath: graph.source.rootPath,
      syncStatus: graph.source.syncStatus,
      lastSyncedAt: graph.source.lastSyncedAt,
    },
    description: graph.workspace.description ?? "",
  });

  const walk = (node: FishFolderNode, parentId: string) => {
    for (const child of node.folders) {
      folders.push({
        id: child.id,
        workspace_id: workspaceId,
        parent_id: parentId,
        name: child.name,
        sort_order: child.seq ?? 0,
        created_at: now,
        updated_at: now,
        source_kind: "filesystem",
        source_path: child.relativePath,
        description: child.meta.description ?? "",
      });
      walk(child, child.id);
    }

    for (const reqNode of node.requests) {
      const draft = fishRequestToDraft(reqNode.request, {
        collectionId: parentId,
      });
      const row = requestToRow(draft, parentId) as SavedRequest;
      // Prefer document timestamps when present
      const created = Date.parse(reqNode.request.createdAt ?? "");
      const updated = Date.parse(reqNode.request.updatedAt ?? "");
      requests.push({
        ...row,
        sort_order: reqNode.request.seq ?? row.sort_order,
        created_at: Number.isFinite(created) ? created : row.created_at,
        updated_at: Number.isFinite(updated) ? updated : row.updated_at,
      });
    }
  };

  // Flatten collections/ into the workspace root (don't show a synthetic "collections" node).
  walk(graph.collectionsRoot, rootId);

  return { folders, requests, rootFolderId: rootId };
}
