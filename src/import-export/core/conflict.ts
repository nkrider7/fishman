import type { CollectionFolder } from "@/types/collection";
import { generateId } from "@/utils/id";
import type { ImportConflictStrategy, ImportResult } from "./types";

export interface ImportCollectionOptions {
  conflictStrategy?: ImportConflictStrategy;
  replaceFolderId?: string;
  skipRootCreation?: boolean;
}

export function findConflictingRoot(
  result: ImportResult,
  existingFolders: CollectionFolder[],
): CollectionFolder | undefined {
  return existingFolders.find(
    (f) => !f.parent_id && f.name === result.rootFolder.name,
  );
}

export function prepareImportWithStrategy(
  result: ImportResult,
  existingFolders: CollectionFolder[],
  strategy: ImportConflictStrategy = "duplicate",
): { data: ImportResult; options: ImportCollectionOptions } | null {
  const conflict = findConflictingRoot(result, existingFolders);

  if (!conflict) {
    return { data: result, options: {} };
  }

  switch (strategy) {
    case "skip":
      return null;

    case "replace":
      return {
        data: result,
        options: { replaceFolderId: conflict.id },
      };

    case "duplicate":
      return {
        data: {
          ...result,
          rootFolder: {
            ...result.rootFolder,
            id: generateId(),
            name: `${result.rootFolder.name} (Copy)`,
          },
        },
        options: {},
      };

    case "merge": {
      const oldRootId = result.rootFolder.id;
      const targetRootId = conflict.id;
      const folderIdMap = new Map<string, string>();

      for (const folder of result.folders) {
        folderIdMap.set(folder.id, generateId());
      }

      const remapFolderParent = (parentId: string | null): string | null => {
        if (!parentId || parentId === oldRootId) return targetRootId;
        return folderIdMap.get(parentId) ?? parentId;
      };

      return {
        data: {
          ...result,
          rootFolder: {
            id: targetRootId,
            parent_id: null,
            name: conflict.name,
            sort_order: conflict.sort_order,
          },
          folders: result.folders.map((folder) => ({
            ...folder,
            id: folderIdMap.get(folder.id) ?? generateId(),
            parent_id: remapFolderParent(folder.parent_id),
          })),
          requests: result.requests.map((req) => {
            const newId = generateId();
            const collectionId = remapFolderParent(req.collection_id)!;
            return {
              ...req,
              id: newId,
              collection_id: collectionId,
              draft: {
                ...req.draft,
                id: newId,
                collectionId,
              },
            };
          }),
        },
        options: { skipRootCreation: true },
      };
    }

    default:
      return { data: result, options: {} };
  }
}
