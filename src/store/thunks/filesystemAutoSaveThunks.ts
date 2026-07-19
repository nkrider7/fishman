import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  AutoSaveScheduler,
  markSelfWrite,
  saveRequestOnDisk,
} from "@/git-native";
import type { RootState, AppDispatch } from "../index";
import { updateTab } from "../slices/tabsSlice";
import {
  setAutoSaveStatus,
  resetFilesystemSync,
} from "../slices/filesystemSyncSlice";

let scheduler: AutoSaveScheduler | null = null;
let gitStatusTimer: ReturnType<typeof setTimeout> | null = null;

function ensureScheduler(dispatch: AppDispatch, getState: () => RootState) {
  if (scheduler) return scheduler;

  scheduler = new AutoSaveScheduler({
    debounceMs: 800,
    onStatus: (status) => {
      dispatch(setAutoSaveStatus(status));
    },
    write: async (requestId) => {
      const state = getState();
      if (state.collections.sourceMode !== "filesystem") return;
      const root = state.collections.filesystemRootPath;
      if (!root) return;

      const conflicted = new Set(
        (state.git.status?.changes ?? [])
          .filter((c) => c.status === "conflicted")
          .map((c) => c.path),
      );
      const row = state.collections.requests.find((r) => r.id === requestId);
      if (row?.source_path && conflicted.has(row.source_path)) {
        throw new Error(
          "This file has a merge conflict — resolve it before auto-save.",
        );
      }

      const tab = state.tabs.tabs.find((t) => t.requestId === requestId);
      if (!tab) return;
      const draft = state.request.drafts[tab.id];
      if (!draft) return;

      const saved = await saveRequestOnDisk({
        request: { ...draft, id: requestId },
        collectionId: draft.collectionId ?? row?.collection_id ?? null,
        folders: state.collections.folders,
        workspaceRootPath: root,
      });

      const abs =
        root.replace(/\/$/, "") + "/" + (saved.source_path ?? "").replace(/^\//, "");
      markSelfWrite([abs, saved.source_path ?? ""]);

      dispatch(
        updateTab({
          id: tab.id,
          changes: { unsaved: false, title: saved.name || draft.name },
        }),
      );

      if (gitStatusTimer) clearTimeout(gitStatusTimer);
      gitStatusTimer = setTimeout(() => {
        void import("./gitThunks").then(({ refreshGitStatus }) => {
          void dispatch(refreshGitStatus());
        });
      }, 600);
    },
  });

  return scheduler;
}

/** Schedule auto-save for a saved filesystem request (by request id). */
export const scheduleFilesystemAutoSave = createAsyncThunk(
  "filesystem/scheduleAutoSave",
  async (requestId: string, { dispatch, getState }) => {
    const state = getState() as RootState;
    if (state.collections.sourceMode !== "filesystem") return;
    if (!requestId) return;
    ensureScheduler(dispatch as AppDispatch, () => getState() as RootState).schedule(
      requestId,
    );
  },
);

/** Flush one or all pending auto-saves immediately. */
export const flushFilesystemAutoSave = createAsyncThunk(
  "filesystem/flushAutoSave",
  async (requestId: string | undefined, { dispatch, getState }) => {
    const state = getState() as RootState;
    if (state.collections.sourceMode !== "filesystem") return;
    const s = ensureScheduler(
      dispatch as AppDispatch,
      () => getState() as RootState,
    );
    if (requestId) await s.flush(requestId);
    else await s.flushAll();
  },
);

export const cancelFilesystemAutoSaves = createAsyncThunk(
  "filesystem/cancelAutoSaves",
  async (_, { dispatch }) => {
    scheduler?.cancel();
    scheduler?.destroy();
    scheduler = null;
    if (gitStatusTimer) clearTimeout(gitStatusTimer);
    gitStatusTimer = null;
    dispatch(resetFilesystemSync());
  },
);

/**
 * Called when a draft becomes dirty. Only auto-saves requests that already
 * have a requestId (saved). Untitled drafts wait for explicit Ctrl+S.
 */
export function maybeScheduleAutoSaveFromTab(
  dispatch: AppDispatch,
  getState: () => RootState,
  tabId: string,
): void {
  const state = getState();
  if (state.collections.sourceMode !== "filesystem") return;
  const tab = state.tabs.tabs.find((t) => t.id === tabId);
  if (!tab?.requestId || !tab.unsaved) return;
  void dispatch(scheduleFilesystemAutoSave(tab.requestId));
}

export function markSavedPathSelfWrite(
  workspaceRootPath: string,
  sourcePath: string | null | undefined,
): void {
  if (!sourcePath) return;
  const abs = `${workspaceRootPath.replace(/\/$/, "")}/${sourcePath.replace(/^\//, "")}`;
  markSelfWrite([abs, sourcePath]);
}
