import type { GitNativeFs } from "../fs";
import {
  COLLECTIONS_DIR,
  DEFAULT_FISHMAN_GITIGNORE,
  ENVIRONMENTS_DIR,
  FOLDER_META_FILE,
  HISTORY_DIR,
  MOCKS_DIR,
  SCRIPTS_DIR,
  SECRETS_SUFFIX,
  TESTS_DIR,
  VARIABLES_DIR,
  WORKSPACE_FILE,
  type FishEnvironment,
  type FishFolderMeta,
  type FishRequest,
  type FishWorkspace,
} from "../schema";
import type {
  FishEnvironmentNode,
  FishFolderNode,
  FishRequestNode,
  FishmanWorkspaceGraph,
} from "../types";
import { atomicWriteFile, atomicWriteJson } from "./atomic-write";
import { requestFileName } from "./filename";
import { stripSecretVariables } from "./inheritance";
import { serializeJson } from "./json";
import { resolveUnderRoot } from "./paths";

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      out[key] = value;
      continue;
    }
    if (value && typeof value === "object") {
      out[key] = pruneUndefined(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

function serializeRequest(req: FishRequest): Record<string, unknown> {
  return pruneUndefined({
    id: req.id,
    name: req.name,
    method: req.method,
    url: req.url,
    headers: req.headers ?? [],
    query: req.query ?? [],
    body: req.body ?? { type: "none", content: "" },
    auth: req.auth ?? { type: "none" },
    scripts: req.scripts ?? {
      preRequest: "",
      postResponse: "",
      tests: "",
    },
    variables: req.variables ?? [],
    description: req.description,
    favorite: req.favorite || undefined,
    seq: req.seq,
    source: req.source,
    createdAt: req.createdAt ?? "",
    updatedAt: req.updatedAt ?? "",
  });
}

async function writeRequest(
  fs: GitNativeFs,
  rootPath: string,
  node: FishRequestNode,
): Promise<void> {
  const abs = resolveUnderRoot(rootPath, node.relativePath, (...p) =>
    fs.join(...p),
  );
  await atomicWriteJson(fs, abs, serializeRequest(node.request));
}

async function writeFolderMeta(
  fs: GitNativeFs,
  rootPath: string,
  folder: FishFolderNode,
): Promise<void> {
  if (folder.relativePath === COLLECTIONS_DIR) return;
  const meta: FishFolderMeta = folder.meta;
  const hasContent =
    meta.id ||
    meta.name ||
    meta.seq !== undefined ||
    meta.description ||
    (meta.headers && meta.headers.length > 0) ||
    (meta.variables && meta.variables.length > 0) ||
    (meta.postResponseVars && meta.postResponseVars.length > 0) ||
    meta.auth ||
    meta.scripts ||
    meta.presets;
  if (!hasContent) return;

  const rel = `${folder.relativePath}/${FOLDER_META_FILE}`;
  const abs = resolveUnderRoot(rootPath, rel, (...p) => fs.join(...p));
  await atomicWriteJson(fs, abs, pruneUndefined({ ...meta }));
}

async function writeFolderTree(
  fs: GitNativeFs,
  rootPath: string,
  folder: FishFolderNode,
): Promise<void> {
  const abs = resolveUnderRoot(rootPath, folder.relativePath, (...p) =>
    fs.join(...p),
  );
  await fs.mkdir(abs, { recursive: true });
  await writeFolderMeta(fs, rootPath, folder);

  for (const child of folder.folders) {
    await writeFolderTree(fs, rootPath, child);
  }
  for (const request of folder.requests) {
    await writeRequest(fs, rootPath, request);
  }
}

async function writeEnvironment(
  fs: GitNativeFs,
  rootPath: string,
  env: FishEnvironmentNode,
): Promise<void> {
  const { publicVars, secretVars } = stripSecretVariables(
    env.environment.variables ?? [],
  );
  const fromOverlay = env.secretVariables ?? [];
  const allSecrets = [
    ...secretVars,
    ...fromOverlay.filter((s) => !secretVars.some((v) => v.key === s.key)),
  ];

  const publicDoc: FishEnvironment = {
    id: env.id,
    name: env.name,
    seq: env.environment.seq,
    variables: publicVars.map((v) => (v.secret ? { ...v, value: "" } : v)),
  };

  await atomicWriteJson(
    fs,
    resolveUnderRoot(rootPath, env.relativePath, (...p) => fs.join(...p)),
    pruneUndefined({ ...publicDoc }),
  );

  if (allSecrets.length > 0) {
    const base = env.relativePath.replace(/\.json$/i, "");
    const secretsPath =
      env.secretsRelativePath ?? `${base}${SECRETS_SUFFIX}`;
    await atomicWriteJson(
      fs,
      resolveUnderRoot(rootPath, secretsPath, (...p) => fs.join(...p)),
      pruneUndefined({
        name: env.name,
        variables: allSecrets.map((v) => ({
          key: v.key,
          value: v.value,
          enabled: v.enabled ?? true,
          secret: true,
          ...(v.id ? { id: v.id } : {}),
        })),
      }),
    );
  }
}

export interface SerializeWorkspaceOptions {
  writeGitignore?: boolean;
  ensureScaffoldDirs?: boolean;
}

const SCAFFOLD_DIRS = [
  COLLECTIONS_DIR,
  ENVIRONMENTS_DIR,
  SCRIPTS_DIR,
  TESTS_DIR,
  MOCKS_DIR,
  VARIABLES_DIR,
  HISTORY_DIR,
] as const;

/**
 * Write a full workspace graph to disk.
 * Prefer per-request atomic writes for incremental auto-save.
 */
export async function serializeWorkspaceDir(
  fs: GitNativeFs,
  graph: FishmanWorkspaceGraph,
  options: SerializeWorkspaceOptions = {},
): Promise<void> {
  const rootPath = graph.source.rootPath;
  await fs.mkdir(rootPath, { recursive: true });

  if (options.ensureScaffoldDirs !== false) {
    for (const dir of SCAFFOLD_DIRS) {
      await fs.mkdir(
        resolveUnderRoot(rootPath, dir, (...p) => fs.join(...p)),
        { recursive: true },
      );
    }
  }

  const workspace: FishWorkspace = {
    ...graph.workspace,
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(
    fs,
    resolveUnderRoot(rootPath, WORKSPACE_FILE, (...p) => fs.join(...p)),
    pruneUndefined({ ...workspace }),
  );

  await writeFolderTree(fs, rootPath, graph.collectionsRoot);

  for (const env of graph.environments) {
    await writeEnvironment(fs, rootPath, env);
  }

  if (options.writeGitignore !== false) {
    const gi = resolveUnderRoot(rootPath, ".gitignore", (...p) =>
      fs.join(...p),
    );
    if (!(await fs.exists(gi))) {
      await atomicWriteFile(fs, gi, DEFAULT_FISHMAN_GITIGNORE);
    }
  }
}

export function serializeRequestJson(req: FishRequest): string {
  return serializeJson(serializeRequest(req));
}

export function suggestRequestRelativePath(
  folderRelativePath: string,
  requestName: string,
  usedNames: Set<string>,
): string {
  // unique among lowercase names
  const used = new Set([...usedNames].map((n) => n.toLowerCase()));
  let file = requestFileName(requestName);
  if (used.has(file.toLowerCase())) {
    const stem = file.replace(/\.fish$/i, "");
    let i = 2;
    while (used.has(`${stem} (${i}).fish`.toLowerCase())) i += 1;
    file = `${stem} (${i}).fish`;
  }
  return folderRelativePath ? `${folderRelativePath}/${file}` : file;
}

/** @deprecated Use serializeWorkspaceDir */
export const serializeCollectionDir = serializeWorkspaceDir;
