import { open } from "@tauri-apps/plugin-dialog";
import type { CollectionFolder, SavedRequest } from "@/types/collection";
import { parseFolderSettings } from "@/types/collection";
import { rowToRequest } from "@/services/dbService";
import {
  COLLECTIONS_DIR,
  FISHMAN_DIR,
  FISHMAN_PROJECT_FORMAT_VERSION,
} from "../schema";
import { createUid } from "../codec/ids";
import { kvToFish, requestDraftToFish } from "../codec/map-draft";
import { filenameFromName, requestFileName } from "../codec/filename";
import { serializeWorkspaceDir } from "../codec/serialize";
import { createTauriGitNativeFs } from "../fs/tauri-fs";
import { detectGit } from "../git/detect";
import { getGitOperations } from "../git/operations";
import type {
  FishFolderNode,
  FishRequestNode,
  FishmanWorkspaceGraph,
} from "../types";
import { graphToCollectionTree } from "./graph-to-collections";

function hasScriptContent(scripts: {
  preRequest?: string;
  postResponse?: string;
  tests?: string;
}): boolean {
  return Boolean(
    scripts.preRequest?.trim() ||
      scripts.postResponse?.trim() ||
      scripts.tests?.trim(),
  );
}

function folderToNode(
  folder: CollectionFolder,
  relativePath: string,
  allFolders: CollectionFolder[],
  allRequests: SavedRequest[],
): FishFolderNode {
  const settings = parseFolderSettings(folder);
  const childFolders = allFolders
    .filter((f) => f.parent_id === folder.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const childRequests = allRequests
    .filter((r) => r.collection_id === folder.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

  const usedNames = new Set<string>();
  const requests: FishRequestNode[] = childRequests.map((row) => {
    const draft = rowToRequest(row);
    const fish = requestDraftToFish(draft, { seq: row.sort_order });
    let file = requestFileName(row.name);
    if (usedNames.has(file.toLowerCase())) {
      const stem = file.replace(/\.fish$/i, "");
      let i = 2;
      while (usedNames.has(`${stem} (${i}).fish`.toLowerCase())) i += 1;
      file = `${stem} (${i}).fish`;
    }
    usedNames.add(file.toLowerCase());
    return {
      id: row.id,
      name: row.name,
      relativePath: `${relativePath}/${file}`,
      request: fish,
    };
  });

  const usedFolderNames = new Set<string>();
  const folders: FishFolderNode[] = childFolders.map((child) => {
    let name = filenameFromName(child.name);
    if (usedFolderNames.has(name.toLowerCase())) {
      let i = 2;
      while (usedFolderNames.has(`${name} (${i})`.toLowerCase())) i += 1;
      name = `${name} (${i})`;
    }
    usedFolderNames.add(name.toLowerCase());
    return folderToNode(
      child,
      `${relativePath}/${name}`,
      allFolders,
      allRequests,
    );
  });

  return {
    id: folder.id,
    name: folder.name,
    relativePath,
    seq: folder.sort_order,
    meta: {
      id: folder.id,
      name: folder.name,
      seq: folder.sort_order,
      description: settings.description || undefined,
      headers: settings.headers.length
        ? settings.headers.map(kvToFish)
        : undefined,
      variables: settings.variables.length
        ? settings.variables.map(kvToFish)
        : undefined,
      postResponseVars: settings.postResponseVars.length
        ? settings.postResponseVars.map((v) => ({
            id: v.id,
            key: v.key,
            expr: v.expr,
            enabled: v.enabled,
          }))
        : undefined,
      auth:
        settings.auth.type !== "none"
          ? {
              type: settings.auth.type,
              bearer: settings.auth.bearer,
              apikey: settings.auth.apikey,
              basic: settings.auth.basic,
              oauth2: settings.auth.oauth2,
              jwt: settings.auth.jwt,
              custom: settings.auth.custom,
            }
          : undefined,
      scripts: hasScriptContent(settings.scripts)
        ? {
            preRequest: settings.scripts.preRequest ?? "",
            postResponse: settings.scripts.postResponse ?? "",
            tests: settings.scripts.tests ?? "",
          }
        : undefined,
      presets:
        settings.presets.defaultMethod || settings.presets.baseUrl
          ? {
              defaultMethod: settings.presets.defaultMethod || undefined,
              baseUrl: settings.presets.baseUrl || undefined,
            }
          : undefined,
    },
    folders,
    requests,
  };
}

/**
 * Build a Fishman workspace graph from a SQLite root collection tree.
 */
export function sqliteCollectionToGraph(input: {
  rootCollectionId: string;
  folders: CollectionFolder[];
  requests: SavedRequest[];
  projectPath: string;
  workspaceRootPath: string;
}): FishmanWorkspaceGraph {
  const root = input.folders.find((f) => f.id === input.rootCollectionId);
  if (!root) {
    throw new Error("Collection not found");
  }

  const now = new Date().toISOString();

  // Map the SQLite root collection into fishman/collections/** (children + root requests).
  const collectionsRoot = folderToNode(
    root,
    COLLECTIONS_DIR,
    input.folders,
    input.requests,
  );
  // Keep synthetic collections/ identity for on-disk layout
  collectionsRoot.name = COLLECTIONS_DIR;
  collectionsRoot.id = createUid("fld");
  collectionsRoot.meta = {};

  return {
    source: {
      kind: "filesystem",
      rootPath: input.workspaceRootPath,
      projectPath: input.projectPath,
      syncStatus: "synced",
      lastSyncedAt: Date.now(),
    },
    workspace: {
      version: FISHMAN_PROJECT_FORMAT_VERSION,
      id: root.id,
      name: root.name,
      description: parseFolderSettings(root).description || undefined,
      createdAt: new Date(root.created_at || Date.now()).toISOString(),
      updatedAt: now,
    },
    collectionsRoot,
    environments: [],
  };
}

export interface InitializeCollectionGitResult {
  projectPath: string;
  workspaceRootPath: string;
  workspaceName: string;
  initializedGit: boolean;
  folderCount: number;
  requestCount: number;
  folders: CollectionFolder[];
  requests: SavedRequest[];
  rootFolderId: string;
}

/**
 * Export a SQLite collection into project/fishman/**, init Git if needed,
 * and return bind info for the Git UI / sidebar.
 */
export async function initializeCollectionGitProject(input: {
  rootCollectionId: string;
  folders: CollectionFolder[];
  requests: SavedRequest[];
  /** Skip dialog when provided. */
  projectPath?: string;
}): Promise<InitializeCollectionGitResult | null> {
  const fs = createTauriGitNativeFs();

  let projectPath = input.projectPath ?? null;
  if (!projectPath) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose folder for Git project",
    });
    if (!selected || Array.isArray(selected)) return null;
    projectPath = selected;
  }

  const workspaceRootPath = fs.join(projectPath, FISHMAN_DIR);
  const detection = await detectGit(fs, projectPath);

  // Avoid silently wiping an existing Fishman project in that folder
  if (await fs.exists(fs.join(workspaceRootPath, "workspace.json"))) {
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            "This folder already has a fishman/ workspace. Exporting will overwrite collection files on disk. Continue?",
          )
        : true;
    if (!ok) return null;
  }

  const graph = sqliteCollectionToGraph({
    rootCollectionId: input.rootCollectionId,
    folders: input.folders,
    requests: input.requests,
    projectPath,
    workspaceRootPath,
  });

  await serializeWorkspaceDir(fs, graph, {
    writeGitignore: true,
    ensureScaffoldDirs: true,
  });

  let initializedGit = false;
  if (!detection.hasGit) {
    await getGitOperations().init(projectPath);
    initializedGit = true;
  }

  // Stage everything for a sensible first commit UX
  try {
    const status = await getGitOperations().status(projectPath);
    const paths = status.changes.filter((c) => !c.staged).map((c) => c.path);
    if (paths.length > 0) {
      await getGitOperations().stage(projectPath, paths);
    }
  } catch {
    // non-fatal
  }

  const tree = graphToCollectionTree(graph, {
    workspaceId: `fs:${graph.workspace.id}`,
  });

  return {
    projectPath,
    workspaceRootPath,
    workspaceName: graph.workspace.name,
    initializedGit,
    folderCount: tree.folders.length,
    requestCount: tree.requests.length,
    folders: tree.folders,
    requests: tree.requests,
    rootFolderId: tree.rootFolderId,
  };
}
