import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { open } from "@tauri-apps/plugin-dialog";
import {
  scanProject,
  createTauriFileSystem,
  importScannedEndpoints,
} from "@/scanner";
import type { ScanProgress, ScanResult } from "@/scanner/models/scan-result";

export type ScannerStep = "select" | "scanning" | "preview" | "importing" | "done";

interface ScannerState {
  open: boolean;
  step: ScannerStep;
  projectPath: string | null;
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
  projectPath: null,
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
    {
      projectPath,
      baseUrl,
    }: { projectPath: string; baseUrl?: string },
    { dispatch },
  ) => {
    const fs = createTauriFileSystem();
    return scanProject(fs, {
      projectPath,
      baseUrl,
      onProgress: (progress) => {
        dispatch(setScanProgress(progress));
      },
    });
  },
);

export const importScanResult = createAsyncThunk(
  "scanner/import",
  async ({
    result,
    collectionName,
    baseUrl,
    selectedEndpointIds,
  }: {
    result: ScanResult;
    collectionName: string;
    baseUrl?: string;
    selectedEndpointIds: string[];
  }) => {
    return importScannedEndpoints(result, {
      collectionName,
      baseUrl,
      selectedEndpointIds,
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
    setCollectionName(state, action: PayloadAction<string>) {
      state.collectionName = action.payload;
    },
    setBaseUrl(state, action: PayloadAction<string>) {
      state.baseUrl = action.payload;
    },
    setProjectPath(state, action: PayloadAction<string | null>) {
      state.projectPath = action.payload;
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
          "Scan failed. Re-select the project folder to grant read access.";
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
  setCollectionName,
  setBaseUrl,
  setProjectPath,
  setScanProgress,
  setSelectedEndpointIds,
  toggleEndpointSelection,
  selectAllEndpoints,
  deselectAllEndpoints,
  setScannerStep,
  setScannerError,
} = scannerSlice.actions;

export default scannerSlice.reducer;
