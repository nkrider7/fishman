import Database from "@tauri-apps/plugin-sql";
import type { CollectionFolder, SavedRequest, Workspace } from "@/types/collection";
import type { HistoryEntry } from "@/types/history";
import type { RequestDraft } from "@/types/request";
import { serializeBodyForStorage, deserializeBodyFromStorage } from "@/types/request";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";
import { generateId } from "@/utils/id";
import { createCollectionEnvironmentFromVariables } from "@/services/environmentService";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:fishman.db");
  }
  return db;
}

const DEFAULT_WORKSPACE_ID = "default-workspace";

export async function initializeDatabase(): Promise<void> {
  const database = await getDb();
  const workspaces = await database.select<Workspace[]>(
    "SELECT * FROM workspaces LIMIT 1",
  );
  if (workspaces.length === 0) {
    const now = Date.now();
    await database.execute(
      "INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)",
      [DEFAULT_WORKSPACE_ID, "Personal", now],
    );
    await database.execute(
      "INSERT INTO settings (key, value_json) VALUES (?, ?)",
      ["app", JSON.stringify(DEFAULT_SETTINGS)],
    );
  }
}

export async function getSettings(): Promise<AppSettings> {
  const database = await getDb();
  const rows = await database.select<{ value_json: string }[]>(
    "SELECT value_json FROM settings WHERE key = ?",
    ["app"],
  );
  if (rows.length === 0) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].value_json) };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const database = await getDb();
  await database.execute(
    "INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)",
    ["app", JSON.stringify(settings)],
  );
}

export async function getCollections(): Promise<CollectionFolder[]> {
  const database = await getDb();
  return database.select<CollectionFolder[]>(
    "SELECT * FROM collections WHERE workspace_id = ? ORDER BY sort_order ASC",
    [DEFAULT_WORKSPACE_ID],
  );
}

export async function createFolder(
  name: string,
  parentId: string | null = null,
): Promise<CollectionFolder> {
  const database = await getDb();
  const now = Date.now();
  const folder: CollectionFolder = {
    id: generateId(),
    workspace_id: DEFAULT_WORKSPACE_ID,
    parent_id: parentId,
    name,
    sort_order: now,
    created_at: now,
    updated_at: now,
  };
  await database.execute(
    "INSERT INTO collections (id, workspace_id, parent_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      folder.id,
      folder.workspace_id,
      folder.parent_id,
      folder.name,
      folder.sort_order,
      folder.created_at,
      folder.updated_at,
    ],
  );
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    "UPDATE collections SET name = ?, updated_at = ? WHERE id = ?",
    [name, Date.now(), id],
  );
}

export async function renameRequest(id: string, name: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    "UPDATE requests SET name = ?, updated_at = ? WHERE id = ?",
    [name, Date.now(), id],
  );
}

export async function moveFolder(
  id: string,
  newParentId: string | null,
): Promise<void> {
  await reorderFolder(id, newParentId, null);
}

export async function moveRequest(
  id: string,
  newCollectionId: string | null,
): Promise<void> {
  await reorderRequest(id, newCollectionId, null);
}

async function getFolderSiblings(
  parentId: string | null,
  excludeId?: string,
): Promise<CollectionFolder[]> {
  const database = await getDb();
  const rows =
    parentId === null
      ? await database.select<CollectionFolder[]>(
          "SELECT * FROM collections WHERE parent_id IS NULL ORDER BY sort_order ASC, created_at ASC",
        )
      : await database.select<CollectionFolder[]>(
          "SELECT * FROM collections WHERE parent_id = ? ORDER BY sort_order ASC, created_at ASC",
          [parentId],
        );
  return excludeId ? rows.filter((row) => row.id !== excludeId) : rows;
}

async function getRequestSiblings(
  collectionId: string | null,
  excludeId?: string,
): Promise<SavedRequest[]> {
  const database = await getDb();
  const rows =
    collectionId === null
      ? await database.select<SavedRequest[]>(
          "SELECT * FROM requests WHERE collection_id IS NULL ORDER BY sort_order ASC, created_at ASC",
        )
      : await database.select<SavedRequest[]>(
          "SELECT * FROM requests WHERE collection_id = ? ORDER BY sort_order ASC, created_at ASC",
          [collectionId],
        );
  return excludeId ? rows.filter((row) => row.id !== excludeId) : rows;
}

export async function reorderFolder(
  id: string,
  parentId: string | null,
  beforeId: string | null,
): Promise<Array<{ id: string; parent_id: string | null; sort_order: number }>> {
  const database = await getDb();
  const now = Date.now();

  if (parentId === id) {
    throw new Error("Cannot move a folder into itself");
  }
  if (parentId) {
    const descendants = await getFolderDescendantIds(id);
    if (descendants.includes(parentId)) {
      throw new Error("Cannot move a folder into its descendant");
    }
  }

  const rows = await database.select<CollectionFolder[]>(
    "SELECT * FROM collections WHERE id = ?",
    [id],
  );
  const moved = rows[0];
  if (!moved) throw new Error("Folder not found");

  const siblings = await getFolderSiblings(parentId, id);
  const insertIndex =
    beforeId === null
      ? siblings.length
      : siblings.findIndex((sibling) => sibling.id === beforeId);
  const index = insertIndex < 0 ? siblings.length : insertIndex;
  siblings.splice(index, 0, { ...moved, parent_id: parentId });

  const updates = siblings.map((sibling, i) => ({
    id: sibling.id,
    parent_id: sibling.id === id ? parentId : sibling.parent_id,
    sort_order: (i + 1) * 1000,
  }));

  for (const update of updates) {
    if (update.id === id) {
      await database.execute(
        "UPDATE collections SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?",
        [update.parent_id, update.sort_order, now, update.id],
      );
    } else {
      await database.execute(
        "UPDATE collections SET sort_order = ?, updated_at = ? WHERE id = ?",
        [update.sort_order, now, update.id],
      );
    }
  }

  return updates;
}

export async function reorderRequest(
  id: string,
  collectionId: string | null,
  beforeId: string | null,
): Promise<Array<{ id: string; collection_id: string | null; sort_order: number }>> {
  const database = await getDb();
  const now = Date.now();

  const rows = await database.select<SavedRequest[]>(
    "SELECT * FROM requests WHERE id = ?",
    [id],
  );
  const moved = rows[0];
  if (!moved) throw new Error("Request not found");

  const siblings = await getRequestSiblings(collectionId, id);
  const insertIndex =
    beforeId === null
      ? siblings.length
      : siblings.findIndex((sibling) => sibling.id === beforeId);
  const index = insertIndex < 0 ? siblings.length : insertIndex;
  siblings.splice(index, 0, { ...moved, collection_id: collectionId });

  const updates = siblings.map((sibling, i) => ({
    id: sibling.id,
    collection_id: sibling.id === id ? collectionId : sibling.collection_id,
    sort_order: (i + 1) * 1000,
  }));

  for (const update of updates) {
    if (update.id === id) {
      await database.execute(
        "UPDATE requests SET collection_id = ?, sort_order = ?, updated_at = ? WHERE id = ?",
        [update.collection_id, update.sort_order, now, update.id],
      );
    } else {
      await database.execute(
        "UPDATE requests SET sort_order = ?, updated_at = ? WHERE id = ?",
        [update.sort_order, now, update.id],
      );
    }
  }

  return updates;
}

async function getFolderDescendantIds(folderId: string): Promise<string[]> {
  const database = await getDb();
  const children = await database.select<{ id: string }[]>(
    "SELECT id FROM collections WHERE parent_id = ?",
    [folderId],
  );
  const ids: string[] = [];
  for (const child of children) {
    ids.push(child.id);
    ids.push(...(await getFolderDescendantIds(child.id)));
  }
  return ids;
}

export async function deleteFolder(id: string): Promise<void> {
  const database = await getDb();
  const childFolders = await database.select<{ id: string }[]>(
    "SELECT id FROM collections WHERE parent_id = ?",
    [id],
  );
  for (const child of childFolders) {
    await deleteFolder(child.id);
  }
  await database.execute("DELETE FROM requests WHERE collection_id = ?", [id]);
  await database.execute("DELETE FROM collections WHERE id = ?", [id]);
}

export async function importCollection(
  data: import("@/import-export/core/types").ImportResult,
  options?: {
    replaceFolderId?: string;
    skipRootCreation?: boolean;
  },
): Promise<{ folders: CollectionFolder[]; requests: SavedRequest[] }> {
  const database = await getDb();
  const now = Date.now();
  const savedFolders: CollectionFolder[] = [];
  const savedRequests: SavedRequest[] = [];

  if (options?.replaceFolderId) {
    await deleteFolder(options.replaceFolderId);
  }

  if (!options?.skipRootCreation) {
    const rootFolder: CollectionFolder = {
      ...data.rootFolder,
      workspace_id: DEFAULT_WORKSPACE_ID,
      created_at: now,
      updated_at: now,
    };
    await database.execute(
      "INSERT INTO collections (id, workspace_id, parent_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        rootFolder.id,
        rootFolder.workspace_id,
        rootFolder.parent_id,
        rootFolder.name,
        rootFolder.sort_order,
        rootFolder.created_at,
        rootFolder.updated_at,
      ],
    );
    savedFolders.push(rootFolder);
  }

  for (const folder of data.folders) {
    const saved: CollectionFolder = {
      ...folder,
      workspace_id: DEFAULT_WORKSPACE_ID,
      created_at: now,
      updated_at: now,
    };
    await database.execute(
      "INSERT INTO collections (id, workspace_id, parent_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        saved.id,
        saved.workspace_id,
        saved.parent_id,
        saved.name,
        saved.sort_order,
        saved.created_at,
        saved.updated_at,
      ],
    );
    savedFolders.push(saved);
  }

  for (const req of data.requests) {
    const saved = await saveRequest(req.draft, req.collection_id);
    savedRequests.push(saved);
  }

  const rootId = savedFolders.find((f) => !f.parent_id)?.id ?? data.rootFolder.id;
  if (data.variables?.length && rootId) {
    await createCollectionEnvironmentFromVariables(rootId, data.variables);
  }

  return { folders: savedFolders, requests: savedRequests };
}

export async function getRequests(): Promise<SavedRequest[]> {
  const database = await getDb();
  return database.select<SavedRequest[]>(
    "SELECT * FROM requests ORDER BY sort_order ASC",
  );
}

export function requestToRow(request: RequestDraft, collectionId?: string | null) {
  return {
    id: request.id,
    collection_id: collectionId ?? request.collectionId ?? null,
    name: request.name,
    method: request.method,
    url: request.url,
    headers_json: JSON.stringify(request.headers),
    params_json: JSON.stringify(request.params),
    body_type: request.bodyType,
    body_json: serializeBodyForStorage(request),
    auth_type: request.auth.type,
    auth_json: JSON.stringify(request.auth),
    is_favorite: request.isFavorite ? 1 : 0,
    sort_order: Date.now(),
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

export function rowToRequest(row: SavedRequest): RequestDraft {
  const bodyType = row.body_type as RequestDraft["bodyType"];
  const { body, formDataFields } = deserializeBodyFromStorage(
    bodyType,
    row.body_json || "",
  );

  return {
    id: row.id,
    name: row.name,
    method: row.method as RequestDraft["method"],
    url: row.url,
    headers: JSON.parse(row.headers_json || "[]"),
    params: JSON.parse(row.params_json || "[]"),
    bodyType,
    body,
    formDataFields,
    auth: JSON.parse(row.auth_json || '{"type":"none"}'),
    collectionId: row.collection_id ?? undefined,
    isFavorite: row.is_favorite === 1,
  };
}

export async function saveRequest(
  request: RequestDraft,
  collectionId?: string | null,
): Promise<SavedRequest> {
  const database = await getDb();
  const row = requestToRow(request, collectionId);
  const existing = await database.select<SavedRequest[]>(
    "SELECT * FROM requests WHERE id = ?",
    [row.id],
  );

  if (existing.length > 0) {
    await database.execute(
      `UPDATE requests SET collection_id = ?, name = ?, method = ?, url = ?,
       headers_json = ?, params_json = ?, body_type = ?, body_json = ?,
       auth_type = ?, auth_json = ?, is_favorite = ?, updated_at = ? WHERE id = ?`,
      [
        row.collection_id,
        row.name,
        row.method,
        row.url,
        row.headers_json,
        row.params_json,
        row.body_type,
        row.body_json,
        row.auth_type,
        row.auth_json,
        row.is_favorite,
        Date.now(),
        row.id,
      ],
    );
  } else {
    await database.execute(
      `INSERT INTO requests (id, collection_id, name, method, url, headers_json, params_json,
       body_type, body_json, auth_type, auth_json, is_favorite, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.collection_id,
        row.name,
        row.method,
        row.url,
        row.headers_json,
        row.params_json,
        row.body_type,
        row.body_json,
        row.auth_type,
        row.auth_json,
        row.is_favorite,
        row.sort_order,
        row.created_at,
        row.updated_at,
      ],
    );
  }

  const saved = await database.select<SavedRequest[]>(
    "SELECT * FROM requests WHERE id = ?",
    [row.id],
  );
  return saved[0];
}

export async function deleteRequest(id: string): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM requests WHERE id = ?", [id]);
}

export async function duplicateRequest(id: string): Promise<SavedRequest> {
  const database = await getDb();
  const rows = await database.select<SavedRequest[]>(
    "SELECT * FROM requests WHERE id = ?",
    [id],
  );
  if (rows.length === 0) throw new Error("Request not found");
  const original = rows[0];
  const draft = rowToRequest(original);
  draft.id = generateId();
  draft.name = `${draft.name} (Copy)`;
  return saveRequest(draft, original.collection_id);
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const database = await getDb();
  return database.select<HistoryEntry[]>(
    "SELECT * FROM history ORDER BY created_at DESC LIMIT 500",
  );
}

export async function addHistoryEntry(
  entry: Omit<HistoryEntry, "id" | "created_at">,
): Promise<HistoryEntry> {
  const database = await getDb();
  const id = generateId();
  const created_at = Date.now();
  await database.execute(
    `INSERT INTO history (id, request_id, method, url, status_code, duration_ms,
     response_size, request_snapshot_json, response_snapshot_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      entry.request_id,
      entry.method,
      entry.url,
      entry.status_code,
      entry.duration_ms,
      entry.response_size,
      entry.request_snapshot_json,
      entry.response_snapshot_json,
      created_at,
    ],
  );
  return { ...entry, id, created_at };
}

export async function clearHistory(): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM history");
}
