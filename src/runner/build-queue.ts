import type { CollectionFolder, SavedRequest } from "@/types/collection";
import type { RunnerQueueItem } from "./types";

function parseTags(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function folderPath(
  folderId: string | null,
  folders: CollectionFolder[],
  rootId: string,
): string {
  if (!folderId || folderId === rootId) return "";
  const parts: string[] = [];
  let current = folders.find((f) => f.id === folderId);
  while (current && current.id !== rootId) {
    parts.unshift(current.name);
    current = current.parent_id
      ? folders.find((f) => f.id === current!.parent_id)
      : undefined;
  }
  return parts.join(" / ");
}

function childFolders(
  parentId: string,
  folders: CollectionFolder[],
): CollectionFolder[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.created_at - b.created_at,
    );
}

function childRequests(
  parentId: string,
  requests: SavedRequest[],
): SavedRequest[] {
  return requests
    .filter((r) => r.collection_id === parentId)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.created_at - b.created_at,
    );
}

function walk(
  folderId: string,
  rootId: string,
  folders: CollectionFolder[],
  requests: SavedRequest[],
  out: RunnerQueueItem[],
): void {
  for (const req of childRequests(folderId, requests)) {
    out.push({
      requestId: req.id,
      name: req.name,
      method: req.method,
      folderPath: folderPath(folderId, folders, rootId),
      tags: parseTags(req.tags_json),
    });
  }
  for (const child of childFolders(folderId, folders)) {
    walk(child.id, rootId, folders, requests, out);
  }
}

/**
 * Depth-first queue of requests under a collection root or folder,
 * ordered by sort_order.
 */
export function buildRunnerQueue(
  rootCollectionId: string,
  folderId: string | null,
  folders: CollectionFolder[],
  requests: SavedRequest[],
): RunnerQueueItem[] {
  const startId = folderId ?? rootCollectionId;
  const out: RunnerQueueItem[] = [];
  walk(startId, rootCollectionId, folders, requests, out);
  return out;
}
