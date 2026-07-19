import Database from "@tauri-apps/plugin-sql";
import type { Workspace } from "@/types/collection";
import { generateId } from "@/utils/id";
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
} from "./constants";
import type { WorkspaceRecord } from "./types";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:fishman.db");
  }
  return db;
}

function toRecord(row: Workspace): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
  };
}

/** Ensure the default Personal workspace exists (idempotent). */
export async function ensureDefaultWorkspace(): Promise<WorkspaceRecord> {
  const database = await getDb();
  const existing = await database.select<Workspace[]>(
    "SELECT * FROM workspaces WHERE id = ? LIMIT 1",
    [DEFAULT_WORKSPACE_ID],
  );
  if (existing[0]) return toRecord(existing[0]);

  const now = Date.now();
  await database.execute(
    "INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)",
    [DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME, now],
  );
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: DEFAULT_WORKSPACE_NAME,
    created_at: now,
  };
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const database = await getDb();
  await ensureDefaultWorkspace();
  const rows = await database.select<Workspace[]>(
    "SELECT * FROM workspaces ORDER BY created_at ASC",
  );
  return rows.map(toRecord);
}

export async function getWorkspace(
  id: string,
): Promise<WorkspaceRecord | null> {
  const database = await getDb();
  const rows = await database.select<Workspace[]>(
    "SELECT * FROM workspaces WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function createWorkspace(name: string): Promise<WorkspaceRecord> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");

  const database = await getDb();
  const dup = await database.select<{ id: string }[]>(
    "SELECT id FROM workspaces WHERE lower(name) = lower(?) LIMIT 1",
    [trimmed],
  );
  if (dup.length > 0) {
    throw new Error(`Workspace "${trimmed}" already exists`);
  }

  const record: WorkspaceRecord = {
    id: generateId(),
    name: trimmed,
    created_at: Date.now(),
  };
  await database.execute(
    "INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)",
    [record.id, record.name, record.created_at],
  );
  return record;
}

export async function renameWorkspace(
  id: string,
  name: string,
): Promise<WorkspaceRecord> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workspace name is required");

  const database = await getDb();
  const current = await getWorkspace(id);
  if (!current) throw new Error("Workspace not found");

  const dup = await database.select<{ id: string }[]>(
    "SELECT id FROM workspaces WHERE lower(name) = lower(?) AND id != ? LIMIT 1",
    [trimmed, id],
  );
  if (dup.length > 0) {
    throw new Error(`Workspace "${trimmed}" already exists`);
  }

  await database.execute("UPDATE workspaces SET name = ? WHERE id = ?", [
    trimmed,
    id,
  ]);
  return { ...current, name: trimmed };
}

export async function countWorkspaceItems(
  id: string,
): Promise<{ collections: number; environments: number }> {
  const database = await getDb();
  const collections = await database.select<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM collections WHERE workspace_id = ?",
    [id],
  );
  const environments = await database.select<{ c: number }[]>(
    "SELECT COUNT(*) as c FROM environments WHERE workspace_id = ?",
    [id],
  );
  return {
    collections: collections[0]?.c ?? 0,
    environments: environments[0]?.c ?? 0,
  };
}

/**
 * Delete a workspace and cascade its collections (and their requests),
 * environments, history, and cookies. Refuses to delete the last workspace.
 */
export async function deleteWorkspace(id: string): Promise<void> {
  const database = await getDb();
  const all = await listWorkspaces();
  if (all.length <= 1) {
    throw new Error("Cannot delete the last workspace");
  }
  if (!all.some((w) => w.id === id)) {
    throw new Error("Workspace not found");
  }

  // Delete requests belonging to this workspace's collections
  await database.execute(
    `DELETE FROM requests WHERE collection_id IN (
      SELECT id FROM collections WHERE workspace_id = ?
    )`,
    [id],
  );
  await database.execute("DELETE FROM collections WHERE workspace_id = ?", [
    id,
  ]);
  await database.execute("DELETE FROM environments WHERE workspace_id = ?", [
    id,
  ]);

  // Best-effort scoped history/cookies (columns added in migration 006)
  try {
    await database.execute("DELETE FROM history WHERE workspace_id = ?", [id]);
  } catch {
    /* column may not exist yet in tests */
  }
  try {
    await database.execute("DELETE FROM cookies WHERE workspace_id = ?", [id]);
  } catch {
    /* column may not exist yet */
  }

  await database.execute("DELETE FROM workspaces WHERE id = ?", [id]);
}
