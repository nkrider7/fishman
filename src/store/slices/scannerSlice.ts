import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { open } from "@tauri-apps/plugin-dialog";
import {
  scanProject,
  createTauriFileSystem,
  importScannedEndpoints,
  scanGitHubRepo,
  parseGitHubRepoUrl,
  formatGitHubRepoLabel,
  toUserFacingGitHubError,
} from "@/scanner";
import type { ScanProgress, ScanResult } from "@/scanner/models/scan-result";

export type ScannerStep = "select" | "scanning" | "preview" | "importing" | "done";
export type ScannerSource = "local" | "github";

interface ScannerState {
  open: boolean;
  step: ScannerStep;
  source: ScannerSource;
  projectPath: string | null;
  githubUrl: string;
  githubRef: string;
  githubToken: string;
  collectionName: string;
  baseUrl: string;
  progress: ScanProgress | null;
  result: ScanResult | null;
  selectedEndpointIds: string[];
  error: string | null;
}

const initialState: ScannerState = {
  open: false,
  step: "select",
  source: "local",
  projectPath: null,
  githubUrl: "",
  githubRef: "",
  githubToken: "",
  collectionName: "Scanned API",
  baseUrl: "http://localhost:3000",
  progress: null,
  result: null,
  selectedEndpointIds: [],
  error: null,
};

export const pickProjectFolder = createAsyncThunk(
  "scanner/pickFolder",
  async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      recursive: true,
      title: "Select backend project folder",
    });
    if (!selected || typeof selected !== "string") return null;
    return selected;
  },
);

export const runBackendScan = createAsyncThunk(
  "scanner/runScan",
  async (
    payload: {
      source: ScannerSource;
      projectPath?: string | null;
      githubUrl?: string;
      githubRef?: string;
      githubToken?: string;
      baseUrl?: string;
    },
    { dispatch },
  ) => {
    const onProgress = (progress: ScanProgress) => {
      dispatch(setScanProgress(progress));
    };

    if (payload.source === "github") {
      const url = payload.githubUrl?.trim() ?? "";
      if (!url) throw new Error("Enter a GitHub repository URL.");
      try {
        return await scanGitHubRepo({
          url,
          ref: payload.githubRef?.trim() || undefined,
          token: payload.githubToken?.trim() || undefined,
          baseUrl: payload.baseUrl,
          onProgress,
        });
      } catch (err) {
        throw new Error(toUserFacingGitHubError(err));
      }
    }

    const projectPath = payload.projectPath;
    if (!projectPath) {
      throw new Error("Select a project folder to scan.");
    }
    const fs = createTauriFileSystem();
    return scanProject(fs, {
      projectPath,
      baseUrl: payload.baseUrl,
      onProgress,
    });
  },
);

export const importScanResult = createAsyncThunk(
  "scanner/import",
  async (
    {
      result,
      collectionName,
      baseUrl,
      selectedEndpointIds,
    }: {
      result: ScanResult;
      collectionName: string;
      baseUrl?: string;
      selectedEndpointIds: string[];
    },
    { getState },
  ) => {
    const state = getState() as import("../index").RootState;
    return importScannedEndpoints(result, {
      collectionName,
      baseUrl,
      selectedEndpointIds,
      workspaceId: state.workspaces.activeWorkspaceId,
    });
  },
);

const scannerSlice = createSlice({
  name: "scanner",
  initialState,
  reducers: {
    openScanner(state) {
      state.open = true;
      state.step = "select";
      state.error = null;
      state.progress = null;
      state.result = null;
      state.selectedEndpointIds = [];
    },
    closeScanner(state) {
      state.open = false;
      state.step = "select";
      state.error = null;
      state.progress = null;
      state.result = null;
      state.projectPath = null;
      state.selectedEndpointIds = [];
    },
    setScannerSource(state, action: PayloadAction<ScannerSource>) {
      state.source = action.payload;
      state.error = null;
    },
    setCollectionName(state, action: PayloadAction<string>) {
      state.collectionName = action.payload;
    },
    setBaseUrl(state, action: PayloadAction<string>) {
      state.baseUrl = action.payload;
    },
    setProjectPath(state, action: PayloadAction<string | null>) {
      state.projectPath = action.payload;
    },
    setGitHubUrl(state, action: PayloadAction<string>) {
      state.githubUrl = action.payload;
      state.error = null;
      try {
        const parsed = parseGitHubRepoUrl(action.payload);
        state.collectionName = `${parsed.repo} API`;
        if (!state.githubRef && parsed.ref) {
          state.githubRef = parsed.ref;
        }
      } catch {
        // leave collection name until URL is valid
      }
    },
    setGitHubRef(state, action: PayloadAction<string>) {
      state.githubRef = action.payload;
    },
    setGitHubToken(state, action: PayloadAction<string>) {
      state.githubToken = action.payload;
    },
    setScanProgress(state, action: PayloadAction<ScanProgress>) {
      state.progress = action.payload;
    },
    setSelectedEndpointIds(state, action: PayloadAction<string[]>) {
      state.selectedEndpointIds = action.payload;
    },
    toggleEndpointSelection(state, action: PayloadAction<string>) {
      const id = action.payload;
      const idx = state.selectedEndpointIds.indexOf(id);
      if (idx >= 0) {
        state.selectedEndpointIds.splice(idx, 1);
      } else {
        state.selectedEndpointIds.push(id);
      }
    },
    selectAllEndpoints(state) {
      if (state.result) {
        state.selectedEndpointIds = state.result.endpoints.map((ep) => ep.id);
      }
    },
    deselectAllEndpoints(state) {
      state.selectedEndpointIds = [];
    },
    setScannerStep(state, action: PayloadAction<ScannerStep>) {
      state.step = action.payload;
    },
    setScannerError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(pickProjectFolder.fulfilled, (state, action) => {
        if (action.payload) {
          state.projectPath = action.payload;
          state.source = "local";
          const folderName = action.payload.split(/[/\\]/).pop() ?? "Scanned API";
          state.collectionName = `${folderName} API`;
        }
      })
      .addCase(runBackendScan.pending, (state) => {
        state.step = "scanning";
        state.error = null;
        state.result = null;
        state.progress = {
          stage: "detecting-language",
          message: "Starting scan...",
          percent: 0,
        };
      })
      .addCase(runBackendScan.fulfilled, (state, action) => {
        state.result = action.payload;
        state.step = "preview";
        state.selectedEndpointIds = action.payload.endpoints.map((ep) => ep.id);
        state.progress = {
          stage: "complete",
          message: `Found ${action.payload.endpoints.length} endpoints`,
          percent: 100,
          routesFound: action.payload.endpoints.length,
        };
      })
      .addCase(runBackendScan.rejected, (state, action) => {
        state.step = "select";
        state.error =
          action.error.message ??
          "Scan failed. Check the folder path or GitHub URL and try again.";
      })
      .addCase(importScanResult.pending, (state) => {
        state.step = "importing";
        state.error = null;
      })
      .addCase(importScanResult.fulfilled, (state) => {
        state.step = "done";
      })
      .addCase(importScanResult.rejected, (state, action) => {
        state.step = "preview";
        state.error = action.error.message ?? "Import failed";
      });
  },
});

export const {
  openScanner,
  closeScanner,
  setScannerSource,
  setCollectionName,
  setBaseUrl,
  setProjectPath,
  setGitHubUrl,
  setGitHubRef,
  setGitHubToken,
  setScanProgress,
  setSelectedEndpointIds,
  toggleEndpointSelection,
  selectAllEndpoints,
  deselectAllEndpoints,
  setScannerStep,
  setScannerError,
} = scannerSlice.actions;

export { formatGitHubRepoLabel };

export default scannerSlice.reducer;
