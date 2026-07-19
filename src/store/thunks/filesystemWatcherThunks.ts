import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  graphToCollectionTree,
  parseWorkspaceDir,
  createTauriGitNativeFs,
  planDiskReload,
  startFishmanWatcher,
  type FishmanWatcher,
} from "@/git-native";
import type { RootState, AppDispatch } from "../index";
import { setFilesystemCollections } from "../slices/collectionsSlice";
import {
  setDiskChangedTabIds,
  setWatcherActive,
  setWatcherError,
} from "../slices/filesystemSyncSlice";
import { setDraft } from "../slices/requestSlice";
import { updateTab } from "../slices/tabsSlice";
import { clearResponse } from "../slices/responseSlice";
import { closeTabsForDeletedRequests } from "./closeTabsForDeletedRequests";
import { setGitError } from "../slices/gitSlice";

let activeWatcher: FishmanWatcher | null = null;
let watchedRoot: string | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

export const refreshFilesystemFromDisk = createAsyncThunk(
  "filesystem/refreshFromDisk",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const root =
      state.collections.filesystemRootPath ?? state.git.workspaceRootPath;
    const projectPath = state.git.projectPath;
    if (!root || state.collections.sourceMode !== "filesystem") return null;

    const previousIds = new Set(state.collections.requests.map((r) => r.id));
    const fs = createTauriGitNativeFs();
    const graph = await parseWorkspaceDir(fs, root);
    if (projectPath) graph.source.projectPath = projectPath;

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

    const nextState = getState() as RootState;
    const plan = planDiskReload({
      tabs: nextState.tabs.tabs,
      previousRequestIds: previousIds,
      requests: tree.requests,
    });

    for (const update of plan.updates) {
      dispatch(setDraft({ tabId: update.tabId, request: update.draft }));
      dispatch(
        updateTab({
          id: update.tabId,
          changes: {
            title: update.title,
            unsaved: false,
            requestId: update.draft.id,
          },
        }),
      );
    }
    for (const tabId of plan.clearResponseTabIds) {
      dispatch(clearResponse(tabId));
    }

    dispatch(setDiskChangedTabIds(plan.diskChangedUnsavedTabIds));

    if (plan.missingRequestIds.length > 0) {
      // Only close missing if those tabs are not unsaved
      const unsavedRequestIds = new Set(
        nextState.tabs.tabs
          .filter((t) => t.unsaved && t.requestId)
          .map((t) => t.requestId!),
      );
      const toClose = plan.missingRequestIds.filter(
        (id) => !unsavedRequestIds.has(id),
      );
      if (toClose.length > 0) {
        await dispatch(closeTabsForDeletedRequests({ requestIds: toClose }));
      }
    }

    // Debounced git status
    void import("./gitThunks").then(({ refreshGitStatus }) => {
      void dispatch(refreshGitStatus());
    });

    return tree;
  },
);

function scheduleReload(dispatch: AppDispatch) {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    void dispatch(refreshFilesystemFromDisk());
  }, 50);
}

export const startFilesystemWatcher = createAsyncThunk(
  "filesystem/startWatcher",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const root =
      state.collections.filesystemRootPath ?? state.git.workspaceRootPath;
    if (!root || state.collections.sourceMode !== "filesystem") {
      return null;
    }

    if (activeWatcher && watchedRoot === root) {
      dispatch(setWatcherActive(true));
      return root;
    }

    if (activeWatcher) {
      await activeWatcher.stop();
      activeWatcher = null;
      watchedRoot = null;
    }

    dispatch(setWatcherError(null));
    activeWatcher = await startFishmanWatcher({
      workspaceRootPath: root,
      debounceMs: 400,
      onChange: () => {
        scheduleReload(dispatch as AppDispatch);
      },
      onError: (message) => {
        dispatch(setWatcherError(message));
        dispatch(setGitError(`File watcher: ${message}`));
      },
    });
    watchedRoot = root;
    dispatch(setWatcherActive(true));
    return root;
  },
);

export const stopFilesystemWatcher = createAsyncThunk(
  "filesystem/stopWatcher",
  async (_, { dispatch }) => {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    if (activeWatcher) {
      await activeWatcher.stop();
      activeWatcher = null;
    }
    watchedRoot = null;
    dispatch(setWatcherActive(false));
  },
);
