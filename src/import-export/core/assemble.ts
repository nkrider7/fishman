import type { CollectionFolder, SavedRequest } from "@/types/collection";
import type { RequestDraft } from "@/types/request";
import type { CollectionExportData } from "./types";

function collectDescendantFolderIds(
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

export function assembleCollectionExportData(
  rootFolderId: string,
  folders: CollectionFolder[],
  requests: SavedRequest[],
  rowToRequest: (row: SavedRequest) => RequestDraft,
): CollectionExportData | null {
  const rootFolder = folders.find((f) => f.id === rootFolderId);
  if (!rootFolder) return null;

  const folderIds = collectDescendantFolderIds(rootFolderId, folders);
  const childFolders = folders.filter((f) => folderIds.has(f.id));
  const collectionRequests = requests
    .filter((r) => r.collection_id && folderIds.has(r.collection_id))
    .map((r) => ({
      sort_order: r.sort_order,
      collection_id: r.collection_id!,
      draft: rowToRequest(r),
    }));

  return {
    rootFolder,
    folders: childFolders,
    requests: collectionRequests,
  };
}

export function getTopLevelFolderNames(
  rootId: string,
  folders: Array<{ id: string; parent_id: string | null; name: string }>,
): string[] {
  return folders
    .filter((f) => f.parent_id === rootId)
    .map((f) => f.name)
    .sort((a, b) => a.localeCompare(b));
}
