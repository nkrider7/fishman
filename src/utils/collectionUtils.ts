import type { CollectionFolder } from "@/types/collection";

export function findRootCollectionId(
  folderId: string | null | undefined,
  folders: CollectionFolder[],
): string | null {
  if (!folderId) return null;
  let current = folders.find((f) => f.id === folderId);
  while (current?.parent_id) {
    current = folders.find((f) => f.id === current!.parent_id);
  }
  return current?.id ?? null;
}
