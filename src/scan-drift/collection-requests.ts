import type { CollectionFolder, SavedRequest } from "@/types/collection";
import { rowToRequest } from "@/services/dbService";
import type { CollectionRequestRef } from "./types";

/** Collect all requests under a root folder (inclusive of nested folders). */
export function collectRequestsUnderRoot(
  rootId: string,
  folders: CollectionFolder[],
  requests: SavedRequest[],
): CollectionRequestRef[] {
  const childrenByParent = new Map<string | null, CollectionFolder[]>();
  for (const folder of folders) {
    const key = folder.parent_id;
    const list = childrenByParent.get(key) ?? [];
    list.push(folder);
    childrenByParent.set(key, list);
  }

  const folderIds = new Set<string>();
  const walk = (id: string) => {
    folderIds.add(id);
    for (const child of childrenByParent.get(id) ?? []) {
      walk(child.id);
    }
  };
  walk(rootId);

  const folderNameById = new Map(folders.map((f) => [f.id, f.name]));
  const parentById = new Map(folders.map((f) => [f.id, f.parent_id]));

  const pathFor = (folderId: string | null): string[] => {
    const parts: string[] = [];
    let cur = folderId;
    while (cur && cur !== rootId) {
      const name = folderNameById.get(cur);
      if (name) parts.unshift(name);
      cur = parentById.get(cur) ?? null;
    }
    return parts;
  };

  return requests
    .filter((r) => r.collection_id && folderIds.has(r.collection_id))
    .map((r) => ({
      id: r.id,
      collectionId: r.collection_id,
      draft: rowToRequest(r),
      folderPath: pathFor(r.collection_id),
    }));
}

export function projectLabelFromLink(link: {
  source: string;
  projectPath?: string;
  githubUrl?: string;
  githubRef?: string;
}): string {
  if (link.source === "github" && link.githubUrl) {
    return link.githubRef
      ? `${link.githubUrl} @ ${link.githubRef}`
      : link.githubUrl;
  }
  return link.projectPath ?? "Unknown project";
}
