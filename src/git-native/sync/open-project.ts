import { open } from "@tauri-apps/plugin-dialog";
import { basename } from "@tauri-apps/api/path";
import { createTauriGitNativeFs } from "../fs/tauri-fs";
import { detectGit } from "../git/detect";
import {
  createFishmanWorkspace,
  discoverWorkspaces,
} from "../workspace/create";
import type { FishmanWorkspaceGraph } from "../types";

export interface OpenProjectResult {
  projectPath: string;
  workspaceRootPath: string;
  workspaceName: string;
  workspaceId: string;
  hasGit: boolean;
  graph: FishmanWorkspaceGraph;
  createdWorkspace: boolean;
}

/**
 * Open a folder as a Fishman git-native project.
 * Ensures `fishman/` workspace exists, detects `.git`.
 */
export async function openGitNativeProject(options?: {
  /** Skip dialog and use this absolute path. */
  projectPath?: string;
  createIfMissing?: boolean;
}): Promise<OpenProjectResult | null> {
  const fs = createTauriGitNativeFs();

  let projectPath = options?.projectPath ?? null;
  if (!projectPath) {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open Fishman project folder",
    });
    if (!selected || Array.isArray(selected)) return null;
    projectPath = selected;
  }

  let createdWorkspace = false;
  let discovered: Awaited<ReturnType<typeof discoverWorkspaces>>;
  try {
    discovered = await discoverWorkspaces(fs, projectPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot read project folder (${projectPath}). ${detail}`,
    );
  }

  if (discovered.length === 0) {
    if (options?.createIfMissing === false) {
      throw new Error(
        "No fishman/ workspace found. Create one or choose a Fishman project.",
      );
    }
    try {
      const folderName = await basename(projectPath);
      const graph = await createFishmanWorkspace(fs, {
        projectPath,
        name: folderName || "Workspace",
      });
      createdWorkspace = true;
      discovered = [
        {
          rootPath: graph.source.rootPath,
          name: graph.workspace.name,
          id: graph.workspace.id,
        },
      ];
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot create fishman/ workspace in ${projectPath}. ${detail}`,
      );
    }
  }

  const primary = discovered[0]!;
  const { parseWorkspaceDir } = await import("../codec/parse");
  const graph = await parseWorkspaceDir(fs, primary.rootPath);
  graph.source.projectPath = projectPath;

  const detection = await detectGit(fs, projectPath);

  return {
    projectPath,
    workspaceRootPath: primary.rootPath,
    workspaceName: primary.name,
    workspaceId: primary.id,
    hasGit: detection.hasGit,
    graph,
    createdWorkspace,
  };
}
