import type { CollectionFolder, SavedRequest } from "@/types/collection";
import type { RequestDraft } from "@/types/request";
import { requestToRow } from "@/services/dbService";
import { COLLECTIONS_DIR, FOLDER_META_FILE } from "../schema";
import { createUid } from "../codec/ids";
import { atomicWriteJson } from "../codec/atomic-write";
import { filenameFromName, requestFileName } from "../codec/filename";
import { requestDraftToFish } from "../codec/map-draft";
import { parseWorkspaceDir } from "../codec/parse";
import { resolveUnderRoot } from "../codec/paths";
import { suggestRequestRelativePath } from "../codec/serialize";
import { createTauriGitNativeFs } from "../fs/tauri-fs";
import type { FishFolderNode } from "../types";

function findFolderRelativePath(
  folders: CollectionFolder[],
  folderId: string | null | undefined,
): string {
  if (!folderId) return COLLECTIONS_DIR;

  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return COLLECTIONS_DIR;

  // Root workspace folder → write under collections/
  if (!folder.parent_id) return COLLECTIONS_DIR;

  if (folder.source_path?.startsWith(`${COLLECTIONS_DIR}/`)) {
    return folder.source_path;
  }
  if (folder.source_path === COLLECTIONS_DIR) {
    return COLLECTIONS_DIR;
  }

  const parts: string[] = [];
  let current: CollectionFolder | undefined = folder;
  while (current && current.parent_id) {
    parts.unshift(filenameFromName(current.name));
    current = folders.find((f) => f.id === current!.parent_id);
  }
  return parts.length > 0
    ? `${COLLECTIONS_DIR}/${parts.join("/")}`
    : COLLECTIONS_DIR;
}

function collectSiblingFileNames(
  node: FishFolderNode,
  dirRelative: string,
): Set<string> {
  const used = new Set<string>();
  const visit = (n: FishFolderNode) => {
    if (n.relativePath === dirRelative) {
      for (const r of n.requests) {
        used.add(r.relativePath.split("/").pop() ?? "");
      }
      return;
    }
    for (const child of n.folders) visit(child);
  };
  visit(node);
  return used;
}

function findRequestRelativePath(
  node: FishFolderNode,
  requestId: string,
): string | null {
  for (const r of node.requests) {
    if (r.id === requestId || r.request.id === requestId) {
      return r.relativePath;
    }
  }
  for (const child of node.folders) {
    const hit = findRequestRelativePath(child, requestId);
    if (hit) return hit;
  }
  return null;
}

export async function createFolderOnDisk(input: {
  name: string;
  parentId: string | null;
  folders: CollectionFolder[];
  workspaceRootPath: string;
  workspaceId: string;
}): Promise<CollectionFolder> {
  const fs = createTauriGitNativeFs();
  const parentRel = findFolderRelativePath(input.folders, input.parentId);
  const folderName = filenameFromName(input.name);
  const relativePath =
    parentRel === COLLECTIONS_DIR
      ? `${COLLECTIONS_DIR}/${folderName}`
      : `${parentRel}/${folderName}`;

  const absDir = resolveUnderRoot(input.workspaceRootPath, relativePath, (...p) =>
    fs.join(...p),
  );
  await fs.mkdir(absDir, { recursive: true });

  const id = createUid("fld");
  const now = Date.now();
  await atomicWriteJson(fs, fs.join(absDir, FOLDER_META_FILE), {
    id,
    name: input.name.trim() || folderName,
    seq: now,
  });

  return {
    id,
    workspace_id: input.workspaceId,
    parent_id: input.parentId,
    name: input.name.trim() || folderName,
    sort_order: now,
    created_at: now,
    updated_at: now,
    source_kind: "filesystem",
    source_path: relativePath,
    sync_status: "dirty",
  };
}

export async function saveRequestOnDisk(input: {
  request: RequestDraft;
  collectionId: string | null;
  folders: CollectionFolder[];
  workspaceRootPath: string;
}): Promise<SavedRequest> {
  const fs = createTauriGitNativeFs();
  const graph = await parseWorkspaceDir(fs, input.workspaceRootPath);

  const folderDir = findFolderRelativePath(input.folders, input.collectionId);
  const existingPath = findRequestRelativePath(
    graph.collectionsRoot,
    input.request.id,
  );

  let relativePath = existingPath;
  if (!relativePath) {
    const used = collectSiblingFileNames(graph.collectionsRoot, folderDir);
    relativePath = suggestRequestRelativePath(
      folderDir,
      input.request.name || "Untitled",
      used,
    );
  }

  const fish = requestDraftToFish(input.request, {
    createdAt: input.request.id ? undefined : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const abs = resolveUnderRoot(input.workspaceRootPath, relativePath, (...p) =>
    fs.join(...p),
  );
  const parentAbs = fs.dirname(abs);
  if (parentAbs) {
    await fs.mkdir(parentAbs, { recursive: true });
  }
  await atomicWriteJson(fs, abs, {
    ...fish,
    id: fish.id,
    name: fish.name,
  });

  // If we renamed (different path desired than existing), remove stale file
  if (existingPath && existingPath !== relativePath) {
    const desiredName = requestFileName(input.request.name || "Untitled");
    const existingName = existingPath.split("/").pop() ?? "";
    if (existingName.toLowerCase() !== desiredName.toLowerCase()) {
      // Keep path stable for v1 — don't rename on disk to avoid churn;
      // content update above already used existingPath.
    }
  }

  const row = requestToRow(
    { ...input.request, id: fish.id, name: fish.name },
    input.collectionId,
  ) as SavedRequest;

  return {
    ...row,
    id: fish.id,
    collection_id: input.collectionId,
    updated_at: Date.now(),
    source_kind: "filesystem",
    source_path: relativePath,
    sync_status: "dirty",
  } as SavedRequest;
}
