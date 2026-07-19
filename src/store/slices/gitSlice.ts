import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  GitCommitInfo,
  GitFileDiff,
  GitRemote,
  GitRepoStatus,
} from "@/git-native";

export type GitUiView = "changes" | "commits" | "remotes" | "sync";

export interface GitSelectedDiff {
  path: string;
  staged: boolean;
}

interface GitState {
  projectPath: string | null;
  workspaceRootPath: string | null;
  workspaceName: string | null;
  status: GitRepoStatus | null;
  view: GitUiView;
  selectedDiff: GitSelectedDiff | null;
  /** Cached loaded diff for the selection */
  activeDiff: GitFileDiff | null;
  diffLoading: boolean;
  commitMessage: string;
  busy: boolean;
  lastError: string | null;
  lastSuccess: string | null;
  commits: GitCommitInfo[];
  remotes: GitRemote[];
  branches: string[];
}

const initialState: GitState = {
  projectPath: null,
  workspaceRootPath: null,
  workspaceName: null,
  status: null,
  view: "changes",
  selectedDiff: null,
  activeDiff: null,
  diffLoading: false,
  commitMessage: "",
  busy: false,
  lastError: null,
  lastSuccess: null,
  commits: [],
  remotes: [],
  branches: [],
};

const gitSlice = createSlice({
  name: "git",
  initialState,
  reducers: {
    setGitProjectBound: (
      state,
      action: PayloadAction<{
        projectPath: string;
        workspaceRootPath: string;
        workspaceName: string;
      }>,
    ) => {
      state.projectPath = action.payload.projectPath;
      state.workspaceRootPath = action.payload.workspaceRootPath;
      state.workspaceName = action.payload.workspaceName;
      state.lastError = null;
    },
    clearGitProject: (state) => {
      Object.assign(state, initialState);
    },
    setGitStatus: (state, action: PayloadAction<GitRepoStatus | null>) => {
      state.status = action.payload;
      if (action.payload) {
        state.remotes = action.payload.remotes;
      }
    },
    setGitView: (state, action: PayloadAction<GitUiView>) => {
      state.view = action.payload;
      if (action.payload !== "changes") {
        state.selectedDiff = null;
        state.activeDiff = null;
      }
    },
    setGitSelectedDiff: (
      state,
      action: PayloadAction<GitSelectedDiff | null>,
    ) => {
      state.selectedDiff = action.payload;
      if (!action.payload) {
        state.activeDiff = null;
        state.diffLoading = false;
      }
    },
    setGitActiveDiff: (state, action: PayloadAction<GitFileDiff | null>) => {
      state.activeDiff = action.payload;
    },
    setGitDiffLoading: (state, action: PayloadAction<boolean>) => {
      state.diffLoading = action.payload;
    },
    setGitCommitMessage: (state, action: PayloadAction<string>) => {
      state.commitMessage = action.payload;
    },
    setGitBusy: (state, action: PayloadAction<boolean>) => {
      state.busy = action.payload;
    },
    setGitError: (state, action: PayloadAction<string | null>) => {
      state.lastError = action.payload;
      if (action.payload) state.lastSuccess = null;
    },
    setGitSuccess: (state, action: PayloadAction<string | null>) => {
      state.lastSuccess = action.payload;
      if (action.payload) state.lastError = null;
    },
    setGitCommits: (state, action: PayloadAction<GitCommitInfo[]>) => {
      state.commits = action.payload;
    },
    setGitRemotes: (state, action: PayloadAction<GitRemote[]>) => {
      state.remotes = action.payload;
    },
    setGitBranches: (state, action: PayloadAction<string[]>) => {
      state.branches = action.payload;
    },
  },
});

export const {
  setGitProjectBound,
  clearGitProject,
  setGitStatus,
  setGitView,
  setGitSelectedDiff,
  setGitActiveDiff,
  setGitDiffLoading,
  setGitCommitMessage,
  setGitBusy,
  setGitError,
  setGitSuccess,
  setGitCommits,
  setGitRemotes,
  setGitBranches,
} = gitSlice.actions;

export default gitSlice.reducer;
