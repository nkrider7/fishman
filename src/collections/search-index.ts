import type { CollectionFolder, SavedRequest } from "@/types/collection";
import { matchesMethodSearch, parseMethodSearch } from "@/http-methods";

export interface SearchIndexEntry {
  id: string;
  name: string;
  method: string;
  url: string;
  folderId: string | null;
  /** Folder path labels joined with " / " for display. */
  folderPath: string;
}

export function buildFolderPathMap(
  folders: CollectionFolder[],
): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const cache = new Map<string, string>();

  const pathFor = (id: string): string => {
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    const parts: string[] = [];
    let current = byId.get(id);
    while (current) {
      parts.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    const path = parts.join(" / ");
    cache.set(id, path);
    return path;
  };

  for (const f of folders) pathFor(f.id);
  return cache;
}

export function buildRequestSearchIndex(
  requests: SavedRequest[],
  folders: CollectionFolder[],
): SearchIndexEntry[] {
  const paths = buildFolderPathMap(folders);
  return requests.map((r) => ({
    id: r.id,
    name: r.name,
    method: r.method,
    url: r.url,
    folderId: r.collection_id,
    folderPath: r.collection_id ? (paths.get(r.collection_id) ?? "") : "",
  }));
}

export function filterSearchIndex(
  index: SearchIndexEntry[],
  query: string,
): SearchIndexEntry[] {
  const q = query.trim();
  if (!q) return index;
  const { textQuery } = parseMethodSearch(q);
  return index.filter((entry) => {
    if (!matchesMethodSearch(entry.method, entry.name, entry.url, q)) {
      // Also match folder path text
      if (
        textQuery &&
        entry.folderPath.toLowerCase().includes(textQuery.toLowerCase())
      ) {
        return true;
      }
      return false;
    }
    return true;
  });
}
