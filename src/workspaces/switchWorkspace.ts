import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "@/store";
import {
  fetchCollections,
  setSelectedFolder,
} from "@/store/slices/collectionsSlice";
import {
  fetchEnvironments,
  syncActiveFromSettings,
} from "@/store/slices/environmentSlice";
import { fetchHistory } from "@/store/slices/historySlice";
import { loadCookies } from "@/store/slices/cookiesSlice";
import { restoreTabs } from "@/store/slices/tabsSlice";
import { replaceDrafts } from "@/store/slices/requestSlice";
import { replaceResponses } from "@/store/slices/responseSlice";
import { clearAllScriptExecutions } from "@/store/slices/scriptExecutionSlice";
import {
  setActiveWorkspaceId,
  setWorkspaceError,
  setWorkspaceSwitching,
  setWorkspaces,
  upsertWorkspace,
  removeWorkspace,
} from "@/store/slices/workspaceSlice";
import { rebindGitProject } from "@/store/thunks/gitThunks";
import {
  createWorkspace as createWorkspaceRecord,
  deleteWorkspace as deleteWorkspaceRecord,
  listWorkspaces,
  renameWorkspace as renameWorkspaceRecord,
  ensureDefaultWorkspace,
  getWorkspace,
} from "./workspaceService";
import {
  createEmptySession,
  loadOrCreateSession,
  saveSession,
  clearSession,
} from "./session";
import {
  persistActiveWorkspaceId,
  resolveInitialWorkspaceId,
  readBootWorkspaceId,
} from "./boot";
import type {
  WorkspaceGitProjectBinding,
  WorkspaceSession,
} from "./types";

/** Pure helper — capture open git project for the leaving workspace. */
export function captureGitProjectBinding(
  state: RootState,
): WorkspaceGitProjectBinding | null {
  const { projectPath, workspaceRootPath, workspaceName } = state.git;
  if (!projectPath || !workspaceRootPath || !workspaceName) {
    return null;
  }
  return { projectPath, workspaceRootPath, workspaceName };
}

function captureSession(state: RootState): WorkspaceSession {
  return {
    tabs: state.tabs.tabs,
    activeTabId: state.tabs.activeTabId,
    drafts: state.request.drafts,
    responses: state.response.responses,
    activeGlobalEnvironmentId: state.environments.activeGlobalEnvironmentId,
    activeCollectionEnvironmentIds:
      state.environments.activeCollectionEnvironmentIds,
    selectedFolderId: state.collections.selectedFolderId,
    gitProject: captureGitProjectBinding(state),
  };
}

function applySession(dispatch: AppDispatch, session: WorkspaceSession) {
  dispatch(
    restoreTabs({ tabs: session.tabs, activeTabId: session.activeTabId }),
  );
  dispatch(replaceDrafts(session.drafts));
  dispatch(replaceResponses(session.responses));
  dispatch(
    syncActiveFromSettings({
      activeGlobalEnvironmentId: session.activeGlobalEnvironmentId,
      activeCollectionEnvironmentIds: session.activeCollectionEnvironmentIds,
    }),
  );
  dispatch(setSelectedFolder(session.selectedFolderId));
  dispatch(clearAllScriptExecutions());
}

async function reloadSqliteWorkspaceData(dispatch: AppDispatch) {
  await Promise.all([
    dispatch(fetchCollections()),
    dispatch(fetchEnvironments()),
    dispatch(fetchHistory()),
    dispatch(loadCookies()),
  ]);
}

async function reloadNonCollectionWorkspaceData(dispatch: AppDispatch) {
  await Promise.all([
    dispatch(fetchEnvironments()),
    dispatch(fetchHistory()),
    dispatch(loadCookies()),
  ]);
}

async function applyWorkspaceSession(
  dispatch: AppDispatch,
  session: WorkspaceSession,
) {
  // Bind/clear git before SQLite reload so fetchCollections sees the right mode.
  await dispatch(rebindGitProject(session.gitProject ?? null));
  if (session.gitProject) {
    // Collections already loaded from disk by rebind — don't fetch SQLite rows.
    await reloadNonCollectionWorkspaceData(dispatch);
  } else {
    await reloadSqliteWorkspaceData(dispatch);
  }
  applySession(dispatch, session);
}

export const bootstrapWorkspaces = createAsyncThunk(
  "workspaces/bootstrap",
  async (_arg, { dispatch }) => {
    await ensureDefaultWorkspace();
    const workspaces = await listWorkspaces();
    dispatch(setWorkspaces(workspaces));
    const activeId = resolveInitialWorkspaceId(
      workspaces.map((w) => w.id),
      readBootWorkspaceId(),
    );
    dispatch(setActiveWorkspaceId(activeId));
    persistActiveWorkspaceId(activeId);

    // Title for secondary windows
    const active = workspaces.find((w) => w.id === activeId);
    if (active && typeof document !== "undefined") {
      document.title = `Fishman — ${active.name}`;
    }

    const session = loadOrCreateSession(activeId);
    if (session.gitProject) {
      await dispatch(rebindGitProject(session.gitProject));
      await reloadNonCollectionWorkspaceData(dispatch as AppDispatch);
    } else {
      await reloadSqliteWorkspaceData(dispatch as AppDispatch);
    }
    return { workspaces, activeId };
  },
);

export const switchWorkspace = createAsyncThunk(
  "workspaces/switch",
  async (workspaceId: string, { dispatch, getState }) => {
    const state = getState() as RootState;
    if (state.workspaces.activeWorkspaceId === workspaceId) {
      return workspaceId;
    }

    const target = state.workspaces.workspaces.find((w) => w.id === workspaceId)
      ?? (await getWorkspace(workspaceId));
    if (!target) {
      throw new Error("Workspace not found");
    }

    dispatch(setWorkspaceSwitching(true));
    dispatch(setWorkspaceError(null));
    try {
      saveSession(state.workspaces.activeWorkspaceId, captureSession(state));

      dispatch(setActiveWorkspaceId(workspaceId));
      persistActiveWorkspaceId(workspaceId);
      if (typeof document !== "undefined") {
        document.title = `Fishman — ${target.name}`;
      }

      const session = loadOrCreateSession(workspaceId);
      await applyWorkspaceSession(dispatch as AppDispatch, session);

      return workspaceId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to switch workspace";
      dispatch(setWorkspaceError(message));
      throw err;
    } finally {
      dispatch(setWorkspaceSwitching(false));
    }
  },
);

export const createWorkspace = createAsyncThunk(
  "workspaces/create",
  async (name: string, { dispatch }) => {
    const record = await createWorkspaceRecord(name);
    dispatch(upsertWorkspace(record));
    // Seed an empty session so first switch feels instant
    saveSession(record.id, createEmptySession());
    await dispatch(switchWorkspace(record.id));
    return record;
  },
);

export const renameWorkspace = createAsyncThunk(
  "workspaces/rename",
  async (
    { id, name }: { id: string; name: string },
    { dispatch, getState },
  ) => {
    const record = await renameWorkspaceRecord(id, name);
    dispatch(upsertWorkspace(record));
    const state = getState() as RootState;
    if (
      state.workspaces.activeWorkspaceId === id &&
      typeof document !== "undefined"
    ) {
      document.title = `Fishman — ${record.name}`;
    }
    return record;
  },
);

export const deleteWorkspace = createAsyncThunk(
  "workspaces/delete",
  async (id: string, { dispatch, getState }) => {
    const state = getState() as RootState;
    const remaining = state.workspaces.workspaces.filter((w) => w.id !== id);
    if (remaining.length === 0) {
      throw new Error("Cannot delete the last workspace");
    }

    const wasActive = state.workspaces.activeWorkspaceId === id;
    await deleteWorkspaceRecord(id);
    clearSession(id);
    dispatch(removeWorkspace(id));

    if (wasActive) {
      const nextId = remaining[0]!.id;
      // Don't save the deleted workspace session — jump cleanly
      dispatch(setActiveWorkspaceId(nextId));
      persistActiveWorkspaceId(nextId);
      const next = remaining[0]!;
      if (typeof document !== "undefined") {
        document.title = `Fishman — ${next.name}`;
      }
      const session = loadOrCreateSession(nextId);
      await applyWorkspaceSession(dispatch as AppDispatch, session);
    }

    return id;
  },
);

export { captureSession, applySession, applyWorkspaceSession };
