import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "../index";
import {
  formatGitError,
  getGitOperations,
  graphToCollectionTree,
  initializeCollectionGitProject,
  openGitNativeProject,
} from "@/git-native";
import { addTab, setActiveTab } from "../slices/tabsSlice";
import {
  setFilesystemCollections,
  fetchCollections,
  clearFilesystemCollections,
} from "../slices/collectionsSlice";
import { setSidebarView } from "../slices/uiSlice";
import {
  setGitBranches,
  setGitBusy,
  setGitCommitMessage,
  setGitCommits,
  setGitError,
  setGitProjectBound,
  setGitRemotes,
  setGitStatus,
  setGitSuccess,
  setGitView,
  setGitSelectedDiff,
  setGitActiveDiff,
  setGitDiffLoading,
  clearGitProject,
  type GitSelectedDiff,
} from "../slices/gitSlice";
import { syncWorkspaceGitProject } from "@/workspaces/session";
import {
  applyFilesystemDraftResync,
  planFilesystemDraftResync,
} from "./filesystem-draft-resync";
import { closeTabsForDeletedRequests } from "./closeTabsForDeletedRequests";

export type GitProjectBinding = {
  projectPath: string;
  workspaceRootPath: string;
  workspaceName: string;
};

function persistActiveWorkspaceGitBinding(
  state: RootState,
  binding: GitProjectBinding | null,
): void {
  syncWorkspaceGitProject(state.workspaces.activeWorkspaceId, binding);
}

export const closeFilesystemProject = createAsyncThunk(
  "git/closeFilesystemProject",
  async (_, { dispatch, getState }) => {
    dispatch(clearGitProject());
    dispatch(clearFilesystemCollections());
    persistActiveWorkspaceGitBinding(getState() as RootState, null);
    await dispatch(fetchCollections());
    dispatch(setSidebarView("collections"));
  },
);

/**
 * Bind or clear the git-native project for the active Fishman UI workspace.
 * Used on workspace switch — does not open a folder picker or Git UI tab.
 */
export const rebindGitProject = createAsyncThunk(
  "git/rebindProject",
  async (binding: GitProjectBinding | null, { dispatch, getState }) => {
    if (!binding) {
      dispatch(clearGitProject());
      dispatch(clearFilesystemCollections());
      return null;
    }

    dispatch(setGitBusy(true));
    dispatch(setGitError(null));
    try {
      const result = await openGitNativeProject({
        projectPath: binding.projectPath,
        createIfMissing: false,
      });
      if (!result) {
        dispatch(clearGitProject());
        dispatch(clearFilesystemCollections());
        return null;
      }

      const nextBinding: GitProjectBinding = {
        projectPath: result.projectPath,
        workspaceRootPath: result.workspaceRootPath,
        workspaceName: result.workspaceName,
      };

      dispatch(setGitProjectBound(nextBinding));

      const tree = graphToCollectionTree(result.graph, {
        workspaceId: `fs:${result.workspaceId}`,
      });
      dispatch(
        setFilesystemCollections({
          folders: tree.folders,
          requests: tree.requests,
          rootFolderId: tree.rootFolderId,
          rootPath: result.workspaceRootPath,
          projectName: result.workspaceName,
        }),
      );

      await refreshAll(dispatch, result.projectPath);
      persistActiveWorkspaceGitBinding(getState() as RootState, nextBinding);
      return result;
    } catch (error) {
      dispatch(clearGitProject());
      dispatch(clearFilesystemCollections());
      dispatch(setGitError(formatGitError(error)));
      return null;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

function requireProjectPath(state: RootState): string {
  const path = state.git.projectPath;
  if (!path) {
    throw new Error("Open a project folder first.");
  }
  return path;
}

async function refreshAll(dispatch: (a: unknown) => unknown, projectPath: string) {
  const ops = getGitOperations();
  const status = await ops.status(projectPath);
  dispatch(setGitStatus(status));
  dispatch(setGitRemotes(status.remotes));
  try {
    const commits = await ops.log(projectPath, 50);
    dispatch(setGitCommits(commits));
  } catch {
    dispatch(setGitCommits([]));
  }
  try {
    const branches = await ops.listBranches(projectPath);
    dispatch(setGitBranches(branches));
  } catch {
    dispatch(setGitBranches([]));
  }
}

function hasDirtyWorktree(state: RootState): boolean {
  return (state.git.status?.changes.length ?? 0) > 0;
}

function hasUnsavedRequestTabs(state: RootState): boolean {
  return state.tabs.tabs.some(
    (t) => t.unsaved && (!t.kind || t.kind === "request"),
  );
}

export const openGitUiTab = createAsyncThunk(
  "git/openUiTab",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    // Don't keep a stale FS/remote error when just opening the empty Git UI.
    if (!state.git.projectPath) {
      dispatch(setGitError(null));
    }
    const existing = state.tabs.tabs.find((t) => t.kind === "git");
    if (existing) {
      dispatch(setActiveTab(existing.id));
      return existing.id;
    }
    dispatch(
      addTab({
        title: "Git UI",
        kind: "git",
      }),
    );
    return (getState() as RootState).tabs.activeTabId;
  },
);

export const openProjectAndGitUi = createAsyncThunk(
  "git/openProject",
  async (_, { dispatch, getState }) => {
    dispatch(setGitBusy(true));
    dispatch(setGitError(null));
    try {
      const result = await openGitNativeProject({ createIfMissing: true });
      if (!result) return null;

      const binding: GitProjectBinding = {
        projectPath: result.projectPath,
        workspaceRootPath: result.workspaceRootPath,
        workspaceName: result.workspaceName,
      };
      dispatch(setGitProjectBound(binding));

      const tree = graphToCollectionTree(result.graph, {
        workspaceId: `fs:${result.workspaceId}`,
      });
      dispatch(
        setFilesystemCollections({
          folders: tree.folders,
          requests: tree.requests,
          rootFolderId: tree.rootFolderId,
          rootPath: result.workspaceRootPath,
          projectName: result.workspaceName,
        }),
      );
      dispatch(setSidebarView("collections"));
      persistActiveWorkspaceGitBinding(getState() as RootState, binding);

      await refreshAll(dispatch, result.projectPath);
      await dispatch(openGitUiTab());

      dispatch(
        setGitSuccess(
          result.createdWorkspace
            ? `Opened ${result.workspaceName} — fishman/ workspace ready`
            : `Opened ${result.workspaceName} (${tree.requests.length} request${tree.requests.length === 1 ? "" : "s"})`,
        ),
      );
      return result;
    } catch (error) {
      const message = formatGitError(error);
      dispatch(setGitError(message));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const refreshGitStatus = createAsyncThunk(
  "git/refreshStatus",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const projectPath = state.git.projectPath;
    if (!projectPath) return null;
    // Skip while another git op holds the FS (statusMatrix is expensive IPC).
    if (state.git.busy) return state.git.status;
    try {
      await refreshAll(dispatch, projectPath);
      return (getState() as RootState).git.status;
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    }
  },
);

export const initGitRepo = createAsyncThunk(
  "git/init",
  async (_, { getState, dispatch }) => {
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    dispatch(setGitError(null));
    try {
      await getGitOperations().init(projectPath);
      await refreshAll(dispatch, projectPath);
      dispatch(setGitSuccess("Git repository initialized"));
      dispatch(setGitView("changes"));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const stageGitPaths = createAsyncThunk(
  "git/stage",
  async (paths: string[], { getState, dispatch }) => {
    if (paths.length === 0) return;
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().stage(projectPath, paths);
      await refreshAll(dispatch, projectPath);
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const unstageGitPaths = createAsyncThunk(
  "git/unstage",
  async (paths: string[], { getState, dispatch }) => {
    if (paths.length === 0) return;
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().unstage(projectPath, paths);
      await refreshAll(dispatch, projectPath);
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const discardGitPaths = createAsyncThunk(
  "git/discard",
  async (paths: string[], { getState, dispatch }) => {
    if (paths.length === 0) return;
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().discard(projectPath, paths);
      await refreshAll(dispatch, projectPath);
      dispatch(setGitSuccess("Discarded local changes"));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const commitGitChanges = createAsyncThunk(
  "git/commit",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const projectPath = requireProjectPath(state);
    const message = state.git.commitMessage.trim();
    if (!message) {
      dispatch(setGitError("Enter a commit message."));
      throw new Error("Enter a commit message.");
    }
    const staged = state.git.status?.changes.filter((c) => c.staged) ?? [];
    if (staged.length === 0) {
      dispatch(setGitError("Stage at least one file before committing."));
      throw new Error("Nothing staged");
    }
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().commit(projectPath, message);
      dispatch(setGitCommitMessage(""));
      await refreshAll(dispatch, projectPath);
      dispatch(setGitSuccess("Committed changes"));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const addGitRemote = createAsyncThunk(
  "git/addRemote",
  async (
    input: { name: string; url: string },
    { getState, dispatch },
  ) => {
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().addRemote(
        projectPath,
        input.name.trim() || "origin",
        input.url.trim(),
      );
      await refreshAll(dispatch, projectPath);
      dispatch(setGitSuccess(`Remote ${input.name || "origin"} added`));
      dispatch(setGitView("changes"));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const removeGitRemote = createAsyncThunk(
  "git/removeRemote",
  async (name: string, { getState, dispatch }) => {
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().removeRemote(projectPath, name);
      await refreshAll(dispatch, projectPath);
      dispatch(setGitSuccess(`Remote ${name} removed`));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const fetchGitRemote = createAsyncThunk(
  "git/fetch",
  async (_, { getState, dispatch }) => {
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().fetch(projectPath);
      await refreshAll(dispatch, projectPath);
      dispatch(setGitSuccess("Fetched from remote"));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const pullGitRemote = createAsyncThunk(
  "git/pull",
  async (_, { getState, dispatch }) => {
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().pull(projectPath);
      await refreshAll(dispatch, projectPath);
      await resyncOpenTabsFromDisk(dispatch as AppDispatch, () => getState() as RootState);
      dispatch(setGitSuccess("Pulled from remote"));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const pushGitRemote = createAsyncThunk(
  "git/push",
  async (_, { getState, dispatch }) => {
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    try {
      await getGitOperations().push(projectPath);
      await refreshAll(dispatch, projectPath);
      dispatch(setGitSuccess("Pushed to remote"));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const checkoutGitBranch = createAsyncThunk(
  "git/checkout",
  async (ref: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const projectPath = requireProjectPath(state);
    const hasCommits = state.git.commits.length > 0;
    const dirty = hasCommits && hasDirtyWorktree(state);
    const unsaved = hasUnsavedRequestTabs(state);

    if (dirty || unsaved) {
      const parts: string[] = [];
      if (dirty) {
        parts.push("You have uncommitted file changes.");
      }
      if (unsaved) {
        parts.push(
          "Open request tabs have unsaved edits — they will be reloaded from disk for this branch.",
        );
      }
      const ok = window.confirm(
        `Switch to "${ref}"?\n\n${parts.join("\n")}\n\n` +
          (dirty
            ? "If Git cannot switch safely, the operation will fail — commit or discard first."
            : ""),
      );
      if (!ok) return;
    }

    dispatch(setGitBusy(true));
    try {
      await getGitOperations().checkout(projectPath, ref);
      await refreshAll(dispatch, projectPath);
      await resyncOpenTabsFromDisk(dispatch as AppDispatch, () => getState() as RootState);
      dispatch(setGitSuccess(`Switched to ${ref}`));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const createGitBranch = createAsyncThunk(
  "git/createBranch",
  async (name: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const projectPath = requireProjectPath(state);
    const trimmed = name.trim();
    if (!trimmed) {
      dispatch(setGitError("Enter a branch name."));
      throw new Error("Enter a branch name.");
    }

    const hasCommits = state.git.commits.length > 0;
    if (hasCommits && hasDirtyWorktree(state)) {
      const ok = window.confirm(
        `You have uncommitted changes. Create and switch to "${trimmed}" anyway?`,
      );
      if (!ok) return;
    }

    const previousBranches = [...state.git.branches];
    const previousCurrent = state.git.status?.branch ?? null;

    dispatch(setGitBusy(true));
    try {
      await getGitOperations().createBranch(projectPath, trimmed);
      await refreshAll(dispatch, projectPath);

      const next = getState() as RootState;
      const nextBranches = next.git.branches;
      const preserved =
        hasCommits &&
        previousCurrent != null &&
        previousCurrent !== trimmed &&
        nextBranches.includes(previousCurrent);

      if (!hasCommits) {
        dispatch(
          setGitSuccess(
            `Branch renamed to ${trimmed}. Commit once so new branches are kept separately.`,
          ),
        );
      } else if (preserved || nextBranches.length > previousBranches.length) {
        dispatch(
          setGitSuccess(
            `Created branch ${trimmed} (kept ${previousCurrent ?? "previous"}).`,
          ),
        );
      } else {
        dispatch(setGitSuccess(`Created branch ${trimmed}`));
      }
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const initializeCollectionGit = createAsyncThunk(
  "git/initializeCollectionGit",
  async (rootCollectionId: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    dispatch(setGitBusy(true));
    dispatch(setGitError(null));
    try {
      // Already a filesystem project bound
      if (
        state.collections.sourceMode === "filesystem" &&
        state.git.projectPath
      ) {
        const status = state.git.status;
        if (!status?.enabled) {
          await getGitOperations().init(state.git.projectPath);
          await refreshAll(dispatch, state.git.projectPath);
          dispatch(setGitSuccess("Git repository initialized"));
        }
        await dispatch(openGitUiTab());
        dispatch(setGitView("changes"));
        return { alreadyBound: true };
      }

      const result = await initializeCollectionGitProject({
        rootCollectionId,
        folders: state.collections.folders,
        requests: state.collections.requests,
      });
      if (!result) return null;

      const binding: GitProjectBinding = {
        projectPath: result.projectPath,
        workspaceRootPath: result.workspaceRootPath,
        workspaceName: result.workspaceName,
      };
      dispatch(setGitProjectBound(binding));

      dispatch(
        setFilesystemCollections({
          folders: result.folders,
          requests: result.requests,
          rootFolderId: result.rootFolderId,
          rootPath: result.workspaceRootPath,
          projectName: result.workspaceName,
        }),
      );

      persistActiveWorkspaceGitBinding(getState() as RootState, binding);
      await refreshAll(dispatch, result.projectPath);
      dispatch(setSidebarView("collections"));
      await dispatch(openGitUiTab());
      dispatch(setGitView("changes"));

      dispatch(
        setGitSuccess(
          result.initializedGit
            ? `Exported “${result.workspaceName}” (${result.requestCount} requests) and initialized Git`
            : `Exported “${result.workspaceName}” into existing Git repo (${result.requestCount} requests)`,
        ),
      );
      return result;
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const refreshFilesystemCollections = createAsyncThunk(
  "git/refreshFilesystemCollections",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const root = state.git.workspaceRootPath;
    const projectPath = state.git.projectPath;
    if (!root || !projectPath) return null;

    const { createTauriGitNativeFs, parseWorkspaceDir, graphToCollectionTree } =
      await import("@/git-native");
    const fs = createTauriGitNativeFs();
    const graph = await parseWorkspaceDir(fs, root);
    graph.source.projectPath = projectPath;
    const tree = graphToCollectionTree(graph, {
      workspaceId: `fs:${graph.workspace.id}`,
    });
    dispatch(
      setFilesystemCollections({
        folders: tree.folders,
        requests: tree.requests,
        rootFolderId: tree.rootFolderId,
        rootPath: root,
        projectName: graph.workspace.name,
      }),
    );
    return tree;
  },
);

/**
 * After checkout/pull: re-read fishman/ from disk and sync open request tabs
 * so the UI matches the branch (not stale Redux drafts).
 */
async function resyncOpenTabsFromDisk(
  dispatch: AppDispatch,
  getState: () => RootState,
): Promise<void> {
  const state = getState();
  if (state.collections.sourceMode !== "filesystem") return;

  const result = await dispatch(refreshFilesystemCollections());
  if (!refreshFilesystemCollections.fulfilled.match(result) || !result.payload) {
    return;
  }

  const next = getState();
  const plan = planFilesystemDraftResync({
    tabs: next.tabs.tabs,
    requests: next.collections.requests,
  });
  applyFilesystemDraftResync(dispatch, plan);

  if (plan.missingRequestIds.length > 0) {
    await dispatch(
      closeTabsForDeletedRequests({ requestIds: plan.missingRequestIds }),
    );
  }
}

export const selectGitFileDiff = createAsyncThunk(
  "git/selectFileDiff",
  async (selection: GitSelectedDiff, { getState, dispatch }) => {
    const state = getState() as RootState;
    const projectPath = state.git.projectPath;
    if (!projectPath) return null;

    dispatch(setGitView("changes"));
    dispatch(setGitSelectedDiff(selection));
    dispatch(setGitDiffLoading(true));
    dispatch(setGitActiveDiff(null));

    try {
      const change = state.git.status?.changes.find(
        (c) => c.path === selection.path && c.staged === selection.staged,
      );
      const diff = await getGitOperations().getFileDiff(
        projectPath,
        selection.path,
        { staged: selection.staged, status: change?.status },
      );
      // Ignore stale responses if user clicked another file
      const current = (getState() as RootState).git.selectedDiff;
      if (
        current?.path === selection.path &&
        current.staged === selection.staged
      ) {
        dispatch(setGitActiveDiff(diff));
      }
      return diff;
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitDiffLoading(false));
    }
  },
);

export const clearGitFileDiff = createAsyncThunk(
  "git/clearFileDiff",
  async (_, { dispatch }) => {
    dispatch(setGitSelectedDiff(null));
    dispatch(setGitActiveDiff(null));
  },
);
