import type { CookieInput, StoredCookie } from "@/types/cookie";
import { generateId } from "@/utils/id";
import { createStoredCookie, normalizeDomain } from "@/utils/cookies";
import Database from "@tauri-apps/plugin-sql";
import { DEFAULT_WORKSPACE_ID } from "@/workspaces/constants";

let db: Database | null = null;
let schemaReady = false;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:fishman.db");
  }
  if (!schemaReady) {
    await ensureCookiesSchema(db);
    schemaReady = true;
  }
  return db;
}

/** Safety net if migration 005/006 did not apply for any reason. */
async function ensureCookiesSchema(database: Database): Promise<void> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS cookies (
      id TEXT PRIMARY KEY NOT NULL,
      domain TEXT NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '/',
      expires TEXT,
      secure INTEGER NOT NULL DEFAULT 0,
      http_only INTEGER NOT NULL DEFAULT 0,
      same_site TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      workspace_id TEXT NOT NULL DEFAULT 'default-workspace'
    )
  `);
  try {
    await database.execute(
      `ALTER TABLE cookies ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default-workspace'`,
    );
  } catch {
    /* column already exists */
  }
  await database.execute(`DROP INDEX IF EXISTS idx_cookies_domain_name_path`);
  await database.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cookies_workspace_domain_name_path
      ON cookies (workspace_id, domain, name, path)
  `);
  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies (domain)
  `);
  await database.execute(`
    CREATE INDEX IF NOT EXISTS idx_cookies_workspace ON cookies (workspace_id)
  `);
}

interface CookieRow {
  id: string;
  domain: string;
  name: string;
  value: string;
  path: string;
  expires: string | null;
  secure: number;
  http_only: number;
  same_site: string | null;
  created_at: string;
  updated_at: string;
  workspace_id?: string;
}

function rowToCookie(row: CookieRow): StoredCookie {
  const sameSite =
    row.same_site === "Strict" ||
    row.same_site === "Lax" ||
    row.same_site === "None"
      ? row.same_site
      : null;

  return {
    id: row.id,
    domain: row.domain,
    name: row.name,
    value: row.value,
    path: row.path,
    expires: row.expires,
    secure: Number(row.secure) === 1,
    httpOnly: Number(row.http_only) === 1,
    sameSite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id ?? DEFAULT_WORKSPACE_ID,
  };
}

export async function listCookies(
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<StoredCookie[]> {
  const database = await getDb();
  try {
    const rows = await database.select<CookieRow[]>(
      "SELECT * FROM cookies WHERE workspace_id = ? ORDER BY domain ASC, name ASC",
      [workspaceId],
    );
    return rows.map(rowToCookie);
  } catch {
    const rows = await database.select<CookieRow[]>(
      "SELECT * FROM cookies ORDER BY domain ASC, name ASC",
    );
    return rows.map(rowToCookie);
  }
}

export async function findCookieByKey(
  domain: string,
  name: string,
  path: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<StoredCookie | null> {
  const database = await getDb();
  try {
    const rows = await database.select<CookieRow[]>(
      "SELECT * FROM cookies WHERE workspace_id = ? AND domain = ? AND name = ? AND path = ? LIMIT 1",
      [workspaceId, normalizeDomain(domain), name, path || "/"],
    );
    return rows[0] ? rowToCookie(rows[0]) : null;
  } catch {
    const rows = await database.select<CookieRow[]>(
      "SELECT * FROM cookies WHERE domain = ? AND name = ? AND path = ? LIMIT 1",
      [normalizeDomain(domain), name, path || "/"],
    );
    return rows[0] ? rowToCookie(rows[0]) : null;
  }
}

export async function upsertCookie(
  input: CookieInput,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<StoredCookie> {
  const database = await getDb();
  const domain = normalizeDomain(input.domain);
  const name = input.name.trim();
  const path = input.path?.trim() || "/";
  const ws = input.workspaceId ?? workspaceId;

  if (!domain) throw new Error("Cookie domain is required");
  if (!name) throw new Error("Cookie name is required");

  let existing: CookieRow | undefined;
  if (input.id) {
    existing = (
      await database.select<CookieRow[]>(
        "SELECT * FROM cookies WHERE id = ? LIMIT 1",
        [input.id],
      )
    )[0];
  } else {
    try {
      existing = (
        await database.select<CookieRow[]>(
          "SELECT * FROM cookies WHERE workspace_id = ? AND domain = ? AND name = ? AND path = ? LIMIT 1",
          [ws, domain, name, path],
        )
      )[0];
    } catch {
      existing = (
        await database.select<CookieRow[]>(
          "SELECT * FROM cookies WHERE domain = ? AND name = ? AND path = ? LIMIT 1",
          [domain, name, path],
        )
      )[0];
    }
  }

  const now = new Date().toISOString();
  const cookie = createStoredCookie(
    {
      ...input,
      domain,
      name,
      path,
    },
    existing?.id ?? input.id ?? generateId(),
  );
  cookie.workspaceId = ws;

  if (existing) {
    cookie.createdAt = existing.created_at;
    cookie.updatedAt = now;
    try {
      await database.execute(
        `UPDATE cookies SET
          domain = ?, name = ?, value = ?, path = ?, expires = ?,
          secure = ?, http_only = ?, same_site = ?, updated_at = ?, workspace_id = ?
         WHERE id = ?`,
        [
          cookie.domain,
          cookie.name,
          cookie.value,
          cookie.path,
          cookie.expires,
          cookie.secure ? 1 : 0,
          cookie.httpOnly ? 1 : 0,
          cookie.sameSite,
          cookie.updatedAt,
          ws,
          cookie.id,
        ],
      );
    } catch {
      await database.execute(
        `UPDATE cookies SET
          domain = ?, name = ?, value = ?, path = ?, expires = ?,
          secure = ?, http_only = ?, same_site = ?, updated_at = ?
         WHERE id = ?`,
        [
          cookie.domain,
          cookie.name,
          cookie.value,
          cookie.path,
          cookie.expires,
          cookie.secure ? 1 : 0,
          cookie.httpOnly ? 1 : 0,
          cookie.sameSite,
          cookie.updatedAt,
          cookie.id,
        ],
      );
    }
  } else {
    try {
      await database.execute(
        `INSERT INTO cookies (
          id, domain, name, value, path, expires, secure, http_only, same_site, created_at, updated_at, workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cookie.id,
          cookie.domain,
          cookie.name,
          cookie.value,
          cookie.path,
          cookie.expires,
          cookie.secure ? 1 : 0,
          cookie.httpOnly ? 1 : 0,
          cookie.sameSite,
          cookie.createdAt,
          cookie.updatedAt,
          ws,
        ],
      );
    } catch {
      await database.execute(
        `INSERT INTO cookies (
          id, domain, name, value, path, expires, secure, http_only, same_site, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cookie.id,
          cookie.domain,
          cookie.name,
          cookie.value,
          cookie.path,
          cookie.expires,
          cookie.secure ? 1 : 0,
          cookie.httpOnly ? 1 : 0,
          cookie.sameSite,
          cookie.createdAt,
          cookie.updatedAt,
        ],
      );
    }
  }

  return cookie;
}

export async function deleteCookie(id: string): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM cookies WHERE id = ?", [id]);
}

export async function deleteCookiesByDomain(
  domain: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<void> {
  const database = await getDb();
  try {
    await database.execute(
      "DELETE FROM cookies WHERE workspace_id = ? AND domain = ?",
      [workspaceId, normalizeDomain(domain)],
    );
  } catch {
    await database.execute("DELETE FROM cookies WHERE domain = ?", [
      normalizeDomain(domain),
    ]);
  }
}

export async function clearAllCookies(
  workspaceId?: string,
): Promise<void> {
  const database = await getDb();
  if (workspaceId) {
    try {
      await database.execute("DELETE FROM cookies WHERE workspace_id = ?", [
        workspaceId,
      ]);
      return;
    } catch {
      /* fall through */
    }
  }
  await database.execute("DELETE FROM cookies");
}

export async function upsertCookies(
  inputs: CookieInput[],
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<StoredCookie[]> {
  const results: StoredCookie[] = [];
  for (const input of inputs) {
    results.push(await upsertCookie(input, workspaceId));
  }
  return results;
}
