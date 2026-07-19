import { GitNativeError } from "../errors";
import type { GitNativeFs } from "../fs";
import {
  COLLECTIONS_DIR,
  ENVIRONMENTS_DIR,
  FOLDER_META_FILE,
  FISHMAN_PROJECT_FORMAT_VERSION,
  REQUEST_EXT,
  SECRETS_SUFFIX,
  WORKSPACE_FILE,
  fishEnvironmentSchema,
  fishFolderMetaSchema,
  fishRequestSchema,
  fishWorkspaceSchema,
  type FishEnvironment,
  type FishFolderMeta,
} from "../schema";
import type {
  FishEnvironmentNode,
  FishFolderNode,
  FishRequestNode,
  FishmanWorkspaceGraph,
} from "../types";
import { createUid, ensureId } from "./ids";
import { mergeSecretOverlay } from "./inheritance";
import { parseJson } from "./json";
import { resolveUnderRoot } from "./paths";

function parseWithSchema<T>(
  schema: {
    safeParse: (
      data: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } };
  },
  data: unknown,
  path: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new GitNativeError(
      "INVALID_DOCUMENT",
      result.error.issues[0]?.message ?? "Invalid document",
      { path },
    );
  }
  return result.data;
}

async function readJsonFile(fs: GitNativeFs, abs: string): Promise<unknown> {
  return parseJson(await fs.readFile(abs), abs);
}

function isRequestFile(name: string): boolean {
  return name.toLowerCase().endsWith(REQUEST_EXT);
}

function isSecretEnvFile(name: string): boolean {
  return name.endsWith(SECRETS_SUFFIX);
}

function envBaseName(name: string): string {
  if (name.endsWith(SECRETS_SUFFIX)) {
    return name.slice(0, -SECRETS_SUFFIX.length);
  }
  return name.replace(/\.json$/i, "");
}

async function loadEnvironments(
  fs: GitNativeFs,
  rootPath: string,
): Promise<FishEnvironmentNode[]> {
  const envDir = resolveUnderRoot(rootPath, ENVIRONMENTS_DIR, (...p) =>
    fs.join(...p),
  );
  if (!(await fs.exists(envDir))) return [];

  const entries = await fs.readDir(envDir);
  const publicFiles = entries.filter(
    (e) =>
      !e.isDirectory &&
      e.name.endsWith(".json") &&
      !isSecretEnvFile(e.name) &&
      !e.name.startsWith("."),
  );
  const secretMap = new Map(
    entries
      .filter((e) => !e.isDirectory && isSecretEnvFile(e.name))
      .map((e) => [envBaseName(e.name), e.name]),
  );

  const out: FishEnvironmentNode[] = [];

  for (const entry of publicFiles) {
    const rel = `${ENVIRONMENTS_DIR}/${entry.name}`;
    const abs = resolveUnderRoot(rootPath, rel, (...p) => fs.join(...p));
    const raw = await readJsonFile(fs, abs);
    const doc = parseWithSchema(
      fishEnvironmentSchema,
      {
        name: envBaseName(entry.name),
        ...(typeof raw === "object" && raw !== null ? raw : {}),
      },
      rel,
    );

    const key = envBaseName(entry.name);
    const secretsName = secretMap.get(key);
    let secretVariables: FishEnvironment["variables"] = [];
    let secretsRelativePath: string | undefined;

    if (secretsName) {
      secretsRelativePath = `${ENVIRONMENTS_DIR}/${secretsName}`;
      const secretsAbs = resolveUnderRoot(rootPath, secretsRelativePath, (...p) =>
        fs.join(...p),
      );
      const secretsRaw = await readJsonFile(fs, secretsAbs);
      const secretsDoc = parseWithSchema(
        fishEnvironmentSchema,
        {
          name: doc.name,
          ...(typeof secretsRaw === "object" && secretsRaw !== null
            ? secretsRaw
            : {}),
        },
        secretsRelativePath,
      );
      secretVariables = (secretsDoc.variables ?? []).map((v) => ({
        ...v,
        secret: true,
      }));
    }

    const id = ensureId(doc.id, () => createUid("env"));
    const merged = mergeSecretOverlay(doc.variables ?? [], secretVariables);

    out.push({
      id,
      name: doc.name,
      relativePath: rel,
      secretsRelativePath,
      environment: { ...doc, id, variables: merged },
      secretVariables,
    });
  }

  out.sort(
    (a, b) =>
      a.environment.seq - b.environment.seq || a.name.localeCompare(b.name),
  );
  return out;
}

async function loadCollectionTree(
  fs: GitNativeFs,
  rootPath: string,
  relativeDir: string,
  folderName: string,
): Promise<FishFolderNode> {
  const absDir =
    relativeDir === ""
      ? rootPath
      : resolveUnderRoot(rootPath, relativeDir, (...p) => fs.join(...p));

  let meta: FishFolderMeta = {};
  if (relativeDir !== "") {
    const metaRel = `${relativeDir}/${FOLDER_META_FILE}`;
    const metaAbs = resolveUnderRoot(rootPath, metaRel, (...p) => fs.join(...p));
    if (await fs.exists(metaAbs)) {
      meta = parseWithSchema(
        fishFolderMetaSchema,
        (await readJsonFile(fs, metaAbs)) ?? {},
        metaRel,
      );
    }
  }

  const entries = await fs.readDir(absDir);
  const folders: FishFolderNode[] = [];
  const requests: FishRequestNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory) {
      const childRel = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;
      folders.push(
        await loadCollectionTree(fs, rootPath, childRel, entry.name),
      );
      continue;
    }

    if (entry.name === FOLDER_META_FILE) continue;
    if (!isRequestFile(entry.name)) continue;

    const rel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const abs = resolveUnderRoot(rootPath, rel, (...p) => fs.join(...p));
    const raw = await readJsonFile(fs, abs);
    const fallbackName = entry.name.replace(/\.fish$/i, "");
    const request = parseWithSchema(
      fishRequestSchema,
      {
        id: createUid("req"),
        name: fallbackName,
        method: "GET",
        ...(typeof raw === "object" && raw !== null ? raw : {}),
      },
      rel,
    );

    requests.push({
      id: request.id,
      name: request.name,
      relativePath: rel,
      request,
    });
  }

  folders.sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name));
  requests.sort(
    (a, b) =>
      (a.request.seq ?? 0) - (b.request.seq ?? 0) ||
      a.name.localeCompare(b.name),
  );

  return {
    id: ensureId(meta.id, () => createUid("fld")),
    name: meta.name ?? folderName,
    relativePath: relativeDir,
    seq: meta.seq ?? 0,
    meta,
    folders,
    requests,
  };
}

/**
 * Load a fishman workspace directory (must contain workspace.json).
 */
export async function parseWorkspaceDir(
  fs: GitNativeFs,
  rootPath: string,
): Promise<FishmanWorkspaceGraph> {
  const wsAbs = resolveUnderRoot(rootPath, WORKSPACE_FILE, (...p) =>
    fs.join(...p),
  );

  if (!(await fs.exists(wsAbs))) {
    throw new GitNativeError(
      "NOT_A_COLLECTION",
      `Missing ${WORKSPACE_FILE} — not a Fishman workspace`,
      { path: rootPath },
    );
  }

  const raw = await readJsonFile(fs, wsAbs);
  const parsed = fishWorkspaceSchema.safeParse(raw);
  if (!parsed.success) {
    const version =
      typeof raw === "object" && raw !== null && "version" in raw
        ? (raw as { version: unknown }).version
        : undefined;
    if (
      typeof version === "number" &&
      version !== FISHMAN_PROJECT_FORMAT_VERSION
    ) {
      throw new GitNativeError(
        "UNSUPPORTED_VERSION",
        `Unsupported workspace version ${version} (expected ${FISHMAN_PROJECT_FORMAT_VERSION})`,
        { path: WORKSPACE_FILE },
      );
    }
    throw new GitNativeError(
      "INVALID_CONFIG",
      parsed.error.issues[0]?.message ?? "Invalid workspace.json",
      { path: WORKSPACE_FILE },
    );
  }

  const collectionsAbs = resolveUnderRoot(rootPath, COLLECTIONS_DIR, (...p) =>
    fs.join(...p),
  );
  const collectionsRoot = (await fs.exists(collectionsAbs))
    ? await loadCollectionTree(fs, rootPath, COLLECTIONS_DIR, "collections")
    : {
        id: createUid("fld"),
        name: "collections",
        relativePath: COLLECTIONS_DIR,
        seq: 0,
        meta: {},
        folders: [],
        requests: [],
      };

  const environments = await loadEnvironments(fs, rootPath);

  return {
    source: {
      kind: "filesystem",
      rootPath,
      syncStatus: "synced",
      lastSyncedAt: Date.now(),
    },
    workspace: parsed.data,
    collectionsRoot,
    environments,
  };
}

/** @deprecated Use parseWorkspaceDir */
export const parseCollectionDir = parseWorkspaceDir;
