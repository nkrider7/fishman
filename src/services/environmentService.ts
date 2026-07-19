import Database from "@tauri-apps/plugin-sql";
import type { Environment, EnvironmentDraft } from "@/types/environment";
import type { KeyValue } from "@/types/request";
import { generateId } from "@/utils/id";
import { DEFAULT_WORKSPACE_ID } from "@/workspaces/constants";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:fishman.db");
  }
  return db;
}

interface EnvironmentRow {
  id: string;
  workspace_id: string;
  collection_id: string | null;
  name: string;
  variables_json: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

function rowToEnvironment(row: EnvironmentRow): Environment {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    collection_id: row.collection_id,
    name: row.name,
    variables: JSON.parse(row.variables_json || "[]") as KeyValue[],
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listAllEnvironments(
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<Environment[]> {
  const database = await getDb();
  const rows = await database.select<EnvironmentRow[]>(
    "SELECT * FROM environments WHERE workspace_id = ? ORDER BY sort_order ASC, created_at ASC",
    [workspaceId],
  );
  return rows.map(rowToEnvironment);
}

export async function listGlobalEnvironments(
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<Environment[]> {
  const database = await getDb();
  const rows = await database.select<EnvironmentRow[]>(
    "SELECT * FROM environments WHERE workspace_id = ? AND collection_id IS NULL ORDER BY sort_order ASC, created_at ASC",
    [workspaceId],
  );
  return rows.map(rowToEnvironment);
}

export async function listCollectionEnvironments(
  collectionId: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<Environment[]> {
  const database = await getDb();
  const rows = await database.select<EnvironmentRow[]>(
    "SELECT * FROM environments WHERE workspace_id = ? AND collection_id = ? ORDER BY sort_order ASC, created_at ASC",
    [workspaceId, collectionId],
  );
  return rows.map(rowToEnvironment);
}

export async function getEnvironmentById(
  id: string,
): Promise<Environment | null> {
  const database = await getDb();
  const rows = await database.select<EnvironmentRow[]>(
    "SELECT * FROM environments WHERE id = ?",
    [id],
  );
  return rows[0] ? rowToEnvironment(rows[0]) : null;
}

export async function createEnvironment(
  draft: EnvironmentDraft,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<Environment> {
  const database = await getDb();
  const now = Date.now();
  const collectionId = draft.collectionId ?? null;

  const existing = await database.select<{ id: string }[]>(
    collectionId === null
      ? "SELECT id FROM environments WHERE workspace_id = ? AND collection_id IS NULL AND name = ?"
      : "SELECT id FROM environments WHERE workspace_id = ? AND collection_id = ? AND name = ?",
    collectionId === null
      ? [workspaceId, draft.name]
      : [workspaceId, collectionId, draft.name],
  );
  if (existing.length > 0) {
    throw new Error(`Environment "${draft.name}" already exists in this scope`);
  }

  const env: Environment = {
    id: generateId(),
    workspace_id: workspaceId,
    collection_id: collectionId,
    name: draft.name,
    variables: draft.variables,
    sort_order: now,
    created_at: now,
    updated_at: now,
  };

  await database.execute(
    "INSERT INTO environments (id, workspace_id, collection_id, name, variables_json, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      env.id,
      env.workspace_id,
      env.collection_id,
      env.name,
      JSON.stringify(env.variables),
      env.sort_order,
      env.created_at,
      env.updated_at,
    ],
  );

  return env;
}

export async function updateEnvironment(
  id: string,
  changes: { name?: string; variables?: KeyValue[] },
): Promise<Environment> {
  const database = await getDb();
  const current = await getEnvironmentById(id);
  if (!current) throw new Error("Environment not found");

  const name = changes.name ?? current.name;
  const variables = changes.variables ?? current.variables;
  const now = Date.now();
  const workspaceId = current.workspace_id;

  if (changes.name && changes.name !== current.name) {
    const duplicate = await database.select<{ id: string }[]>(
      current.collection_id === null
        ? "SELECT id FROM environments WHERE workspace_id = ? AND collection_id IS NULL AND name = ? AND id != ?"
        : "SELECT id FROM environments WHERE workspace_id = ? AND collection_id = ? AND name = ? AND id != ?",
      current.collection_id === null
        ? [workspaceId, name, id]
        : [workspaceId, current.collection_id, name, id],
    );
    if (duplicate.length > 0) {
      throw new Error(`Environment "${name}" already exists in this scope`);
    }
  }

  await database.execute(
    "UPDATE environments SET name = ?, variables_json = ?, updated_at = ? WHERE id = ?",
    [name, JSON.stringify(variables), now, id],
  );

  return { ...current, name, variables, updated_at: now };
}

export async function deleteEnvironment(id: string): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM environments WHERE id = ?", [id]);
}

export async function duplicateEnvironment(id: string): Promise<Environment> {
  const current = await getEnvironmentById(id);
  if (!current) throw new Error("Environment not found");

  let copyName = `${current.name} Copy`;
  let suffix = 2;
  const database = await getDb();
  const workspaceId = current.workspace_id;
  while (true) {
    const existing = await database.select<{ id: string }[]>(
      current.collection_id === null
        ? "SELECT id FROM environments WHERE workspace_id = ? AND collection_id IS NULL AND name = ?"
        : "SELECT id FROM environments WHERE workspace_id = ? AND collection_id = ? AND name = ?",
      current.collection_id === null
        ? [workspaceId, copyName]
        : [workspaceId, current.collection_id, copyName],
    );
    if (existing.length === 0) break;
    copyName = `${current.name} Copy ${suffix}`;
    suffix++;
  }

  return createEnvironment(
    {
      name: copyName,
      variables: current.variables.map((v) => ({ ...v, id: generateId() })),
      collectionId: current.collection_id,
    },
    workspaceId,
  );
}

export async function createCollectionEnvironmentFromVariables(
  collectionId: string,
  variables: KeyValue[],
  name = "Imported Variables",
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<Environment | null> {
  if (variables.length === 0) return null;
  return createEnvironment(
    {
      name,
      variables,
      collectionId,
    },
    workspaceId,
  );
}

export async function deleteEnvironmentsForCollection(
  collectionId: string,
): Promise<void> {
  const database = await getDb();
  await database.execute(
    "DELETE FROM environments WHERE collection_id = ?",
    [collectionId],
  );
}
