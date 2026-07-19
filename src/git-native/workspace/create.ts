import type { GitNativeFs } from "../fs";
import {
  COLLECTIONS_DIR,
  DEFAULT_FISHMAN_GITIGNORE,
  ENVIRONMENTS_DIR,
  FISHMAN_DIR,
  FISHMAN_PROJECT_FORMAT_VERSION,
  HISTORY_DIR,
  MOCKS_DIR,
  SCRIPTS_DIR,
  TESTS_DIR,
  VARIABLES_DIR,
  WORKSPACE_FILE,
  type FishWorkspace,
} from "../schema";
import type { FishmanWorkspaceGraph } from "../types";
import { atomicWriteFile, atomicWriteJson } from "../codec/atomic-write";
import { createUid } from "../codec/ids";
import { resolveUnderRoot } from "../codec/paths";
import { parseWorkspaceDir } from "../codec/parse";

const SCAFFOLD = [
  COLLECTIONS_DIR,
  ENVIRONMENTS_DIR,
  SCRIPTS_DIR,
  TESTS_DIR,
  MOCKS_DIR,
  VARIABLES_DIR,
  HISTORY_DIR,
] as const;

export interface CreateWorkspaceOptions {
  name: string;
  id?: string;
  description?: string;
  /** Absolute project root (parent of fishman/). */
  projectPath: string;
  /** Workspace folder name under fishman/. Omit for fishman/ as the workspace root. */
  workspaceFolder?: string;
}

/**
 * Create `project/fishman[/Workspace]/` with workspace.json, scaffold dirs, .gitignore.
 */
export async function createFishmanWorkspace(
  fs: GitNativeFs,
  options: CreateWorkspaceOptions,
): Promise<FishmanWorkspaceGraph> {
  const fishmanRoot = fs.join(options.projectPath, FISHMAN_DIR);
  const rootPath = options.workspaceFolder
    ? fs.join(fishmanRoot, options.workspaceFolder)
    : fishmanRoot;

  await fs.mkdir(rootPath, { recursive: true });
  for (const dir of SCAFFOLD) {
    await fs.mkdir(fs.join(rootPath, dir), { recursive: true });
  }

  const now = new Date().toISOString();
  const workspace: FishWorkspace = {
    version: FISHMAN_PROJECT_FORMAT_VERSION,
    id: options.id ?? createUid("col"),
    name: options.name,
    description: options.description,
    createdAt: now,
    updatedAt: now,
  };

  await atomicWriteJson(
    fs,
    resolveUnderRoot(rootPath, WORKSPACE_FILE, (...p) => fs.join(...p)),
    workspace,
  );
  await atomicWriteFile(
    fs,
    resolveUnderRoot(rootPath, ".gitignore", (...p) => fs.join(...p)),
    DEFAULT_FISHMAN_GITIGNORE,
  );

  // Seed a default local environment (no secrets)
  await atomicWriteJson(
    fs,
    resolveUnderRoot(rootPath, `${ENVIRONMENTS_DIR}/local.json`, (...p) =>
      fs.join(...p),
    ),
    {
      id: createUid("env"),
      name: "local",
      seq: 0,
      variables: [
        {
          key: "baseUrl",
          value: "http://localhost:3000",
          enabled: true,
        },
      ],
    },
  );

  // Seed a starter collection so the sidebar shows folders immediately.
  const starterFolderId = createUid("fld");
  const starterReqId = createUid("req");
  const starterDir = fs.join(rootPath, COLLECTIONS_DIR, "Getting Started");
  await fs.mkdir(starterDir, { recursive: true });
  await atomicWriteJson(fs, fs.join(starterDir, "_folder.json"), {
    id: starterFolderId,
    name: "Getting Started",
    seq: 0,
  });
  await atomicWriteJson(fs, fs.join(starterDir, "Hello.fish"), {
    id: starterReqId,
    name: "Hello",
    method: "GET",
    url: "{{baseUrl}}/",
    headers: [],
    query: [],
    body: { type: "none", content: "" },
    auth: { type: "none" },
    scripts: { preRequest: "", postResponse: "", tests: "" },
    variables: [],
    source: { kind: "manual", locked: true },
    createdAt: now,
    updatedAt: now,
  });

  const graph = await parseWorkspaceDir(fs, rootPath);
  graph.source.projectPath = options.projectPath;
  return graph;
}

/**
 * Discover workspace roots under project/fishman.
 * - fishman/workspace.json = single workspace
 * - fishman/<name>/workspace.json = multi-workspace
 */
export async function discoverWorkspaces(
  fs: GitNativeFs,
  projectPath: string,
): Promise<{ rootPath: string; name: string; id: string }[]> {
  const fishmanRoot = fs.join(projectPath, FISHMAN_DIR);
  if (!(await fs.exists(fishmanRoot))) return [];

  const directWs = fs.join(fishmanRoot, WORKSPACE_FILE);
  if (await fs.exists(directWs)) {
    const graph = await parseWorkspaceDir(fs, fishmanRoot);
    return [
      {
        rootPath: fishmanRoot,
        name: graph.workspace.name,
        id: graph.workspace.id,
      },
    ];
  }

  const entries = await fs.readDir(fishmanRoot);
  const found: { rootPath: string; name: string; id: string }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const candidate = fs.join(fishmanRoot, entry.name);
    if (await fs.exists(fs.join(candidate, WORKSPACE_FILE))) {
      const graph = await parseWorkspaceDir(fs, candidate);
      found.push({
        rootPath: candidate,
        name: graph.workspace.name,
        id: graph.workspace.id,
      });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
