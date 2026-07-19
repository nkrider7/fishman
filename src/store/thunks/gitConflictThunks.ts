import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  formatGitError,
  getGitOperations,
  hasConflictMarkers,
} from "@/git-native";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { RootState } from "../index";
import { setGitBusy, setGitError, setGitSuccess, setGitView } from "../slices/gitSlice";
import { openRequestTab } from "./openRequestTab";
import { refreshFilesystemFromDisk } from "./filesystemWatcherThunks";

function requireProjectPath(state: RootState): string {
  const path = state.git.projectPath;
  if (!path) throw new Error("Open a project folder first.");
  return path;
}

async function refreshStatus(dispatch: (a: unknown) => unknown, projectPath: string) {
  const { refreshGitStatus } = await import("./gitThunks");
  await dispatch(refreshGitStatus());
  void projectPath;
}

export const resolveGitConflict = createAsyncThunk(
  "git/resolveConflict",
  async (
    input: { path: string; side: "ours" | "theirs" },
    { getState, dispatch },
  ) => {
    const projectPath = requireProjectPath(getState() as RootState);
    dispatch(setGitBusy(true));
    dispatch(setGitError(null));
    try {
      await getGitOperations().resolveConflict(
        projectPath,
        input.path,
        input.side,
      );
      await refreshStatus(dispatch, projectPath);
      if (input.path.endsWith(".fish")) {
        await dispatch(refreshFilesystemFromDisk());
      }
      dispatch(
        setGitSuccess(
          `Resolved ${input.path} using ${input.side === "ours" ? "ours" : "theirs"}`,
        ),
      );
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const markGitConflictResolved = createAsyncThunk(
  "git/markConflictResolved",
  async (path: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const projectPath = requireProjectPath(state);
    dispatch(setGitBusy(true));
    dispatch(setGitError(null));
    try {
      const abs = `${projectPath.replace(/\/$/, "")}/${path}`;
      let text = "";
      try {
        text = await readTextFile(abs);
      } catch {
        text = "";
      }
      if (hasConflictMarkers(text)) {
        const ok = window.confirm(
          "This file still contains conflict markers (<<<<<<<). Stage it anyway?",
        );
        if (!ok) return;
      }
      await getGitOperations().stage(projectPath, [path]);
      await refreshStatus(dispatch, projectPath);
      if (path.endsWith(".fish")) {
        await dispatch(refreshFilesystemFromDisk());
      }
      dispatch(setGitSuccess(`Marked ${path} as resolved`));
    } catch (error) {
      dispatch(setGitError(formatGitError(error)));
      throw error;
    } finally {
      dispatch(setGitBusy(false));
    }
  },
);

export const openConflictFishRequest = createAsyncThunk(
  "git/openConflictFish",
  async (path: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    if (!path.endsWith(".fish")) return null;
    const req = state.collections.requests.find((r) => r.source_path === path);
    if (!req) {
      dispatch(setGitError(`No open collection request for ${path}`));
      return null;
    }
    await dispatch(openRequestTab({ savedRequest: req }));
    dispatch(setGitView("changes"));
    return req.id;
  },
);
