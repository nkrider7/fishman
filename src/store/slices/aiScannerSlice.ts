import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { open } from "@tauri-apps/plugin-dialog";
import {
  scanCodebaseWithAi,
  listenAiScanProgress,
} from "@/services/aiService";
import type {
  AiScannedEndpoint,
  AiScanProgress,
  AiScanSummary,
} from "@/types/ai";
import type { ApiEndpoint } from "@/scanner/models/endpoint";
import type { ScanResult } from "@/scanner/models/scan-result";
import { importScannedEndpoints } from "@/scanner/services/scan-import-service";
import {
  collapseAllTreeFolders,
  fetchCollections,
} from "./collectionsSlice";
import { createEnvironment } from "./environmentSlice";
import { generateId } from "@/utils/id";
import type { RootState } from "../index";

export type AiScannerStep = "select" | "scanning" | "review" | "importing" | "done";

export interface AiScannerState {
  open: boolean;
  step: AiScannerStep;
  projectPath: string | null;
  collectionName: string;
  baseUrl: string;
  generateMocks: boolean;
  detectAuth: boolean;
  createEnvironment: boolean;
  progress: AiScanProgress | null;
  summary: AiScanSummary | null;
  endpoints: AiScannedEndpoint[];
  selectedEndpointIds: string[];
  activeMethodFilter: string;
  searchQuery: string;
  selectedPreviewEndpointId: string | null;
  error: string | null;
}

const initialState: AiScannerState = {
  open: false,
  step: "select",
  projectPath: null,
  collectionName: "AI Scanned API",
  baseUrl: "http://localhost:3000",
  generateMocks: true,
  detectAuth: true,
  createEnvironment: true,
  progress: null,
  summary: null,
  endpoints: [],
  selectedEndpointIds: [],
  activeMethodFilter: "ALL",
  searchQuery: "",
  selectedPreviewEndpointId: null,
  error: null,
};

export const pickAiScanFolder = createAsyncThunk(
  "aiScanner/pickFolder",
  async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      recursive: true,
      title: "Select backend project folder for AI Scan",
    });
    if (!selected || typeof selected !== "string") return null;
    return selected;
  },
);

export const runAiCodebaseScan = createAsyncThunk(
  "aiScanner/runScan",
  async (
    payload: {
      projectPath: string;
      baseUrl?: string;
      generateMocks?: boolean;
      detectAuth?: boolean;
    },
    { dispatch },
  ) => {
    const unlisten = await listenAiScanProgress((progress) => {
      dispatch(setAiScanProgress(progress));
    });

    try {
      const summary = await scanCodebaseWithAi(payload.projectPath, {
        baseUrl: payload.baseUrl,
        defaultCollectionName: undefined,
      });
      return summary;
    } finally {
      unlisten();
    }
  },
);

export const importAiScanEndpoints = createAsyncThunk(
  "aiScanner/importEndpoints",
  async (
    _arg,
    { getState, dispatch },
  ) => {
    const state = getState() as RootState;
    const {
      summary,
      endpoints,
      selectedEndpointIds,
      collectionName,
      baseUrl,
      projectPath,
      createEnvironment: shouldCreateEnv,
    } = state.aiScanner;

    if (!summary || endpoints.length === 0) {
      throw new Error("No endpoints to import");
    }

    const selectedSet = new Set(selectedEndpointIds);
    const selectedEndpoints = endpoints.filter((ep) => selectedSet.has(ep.id));

    if (selectedEndpoints.length === 0) {
      throw new Error("Please select at least one endpoint to import");
    }

    // Convert AiScannedEndpoint into ApiEndpoint
    const apiEndpoints: ApiEndpoint[] = selectedEndpoints.map((ep) => ({
      id: ep.id,
      name: ep.name,
      method: ep.method,
      path: ep.path,
      description: ep.description,
      tags: ep.folder,
      folder: ep.folder.length > 0 ? ep.folder : ["General"],
      headers: ep.headers.map((h) => ({
        name: h.key,
        example: h.value,
        in: "header" as const,
        required: true,
      })),
      authentication: ep.requiresAuth
        ? {
            type: (ep.authType as any) || "bearer",
            required: true,
          }
        : undefined,
      queryParameters: ep.params.map((p) => ({
        name: p.key,
        example: p.value,
        in: "query" as const,
        required: false,
      })),
      pathParameters: [],
      requestBody: ep.body
        ? {
            contentType: ep.bodyType === "json" ? "application/json" : "text/plain",
            raw: ep.body,
            example: ep.body,
          }
        : undefined,
      responses: [],
      middleware: [],
      sourceFile: ep.sourceFile,
      lineNumber: ep.lineNumber,
      framework: ep.framework,
      warnings: [],
    }));

    const scanResult: ScanResult = {
      projectPath: projectPath || "",
      language: summary.frameworkDetected.toLowerCase().includes("python")
        ? "python"
        : summary.frameworkDetected.toLowerCase().includes("go")
          ? "go"
          : summary.frameworkDetected.toLowerCase().includes("java")
            ? "java"
            : "typescript",
      framework: summary.frameworkDetected,
      frameworks: [summary.frameworkDetected],
      endpoints: apiEndpoints,
      warnings: [],
      scannedFiles: summary.filesScanned,
      durationMs: summary.durationMs,
    };

    const importResult = await importScannedEndpoints(scanResult, {
      collectionName,
      baseUrl,
      selectedEndpointIds: selectedEndpoints.map((e) => e.id),
      workspaceId: state.workspaces.activeWorkspaceId,
      conflictStrategy: "replace",
      source: "local",
      projectPath: projectPath ?? undefined,
    });

    const rootFolderId = importResult.folders.find((f) => !f.parent_id)?.id;

    // Create environment for the collection if requested and baseUrl is configured
    if (shouldCreateEnv && baseUrl && rootFolderId) {
      try {
        const resolvedEnvValue = baseUrl.startsWith("{{")
          ? "http://localhost:3000"
          : baseUrl.replace(/\/$/, "");

        await dispatch(
          createEnvironment({
            name: `${collectionName} Local`,
            collectionId: rootFolderId,
            variables: [
              {
                id: generateId(),
                key: "base_url",
                value: resolvedEnvValue,
                enabled: true,
              },
              {
                id: generateId(),
                key: "baseurl",
                value: resolvedEnvValue,
                enabled: true,
              },
            ],
          }),
        );
      } catch {
        // Non-critical environment creation error
      }
    }

    await dispatch(fetchCollections());
    dispatch(collapseAllTreeFolders());

    return {
      count: selectedEndpoints.length,
      collectionName,
    };
  },
);

const aiScannerSlice = createSlice({
  name: "aiScanner",
  initialState,
  reducers: {
    openAiScanner(
      state,
      action: PayloadAction<{ projectPath?: string; collectionName?: string } | undefined>,
    ) {
      state.open = true;
      state.step = "select";
      state.error = null;
      state.progress = null;
      state.summary = null;
      state.endpoints = [];
      state.selectedEndpointIds = [];
      state.activeMethodFilter = "ALL";
      state.searchQuery = "";
      state.selectedPreviewEndpointId = null;

      if (action.payload?.projectPath) {
        state.projectPath = action.payload.projectPath;
        const folderName = action.payload.projectPath.split(/[/\\]/).pop() ?? "Backend";
        state.collectionName = `${folderName} API`;
      }
      if (action.payload?.collectionName) {
        state.collectionName = action.payload.collectionName;
      }
    },
    closeAiScanner(state) {
      state.open = false;
      state.error = null;
    },
    setAiScannerStep(state, action: PayloadAction<AiScannerStep>) {
      state.step = action.payload;
    },
    setAiScannerProjectPath(state, action: PayloadAction<string | null>) {
      state.projectPath = action.payload;
      if (action.payload) {
        const folderName = action.payload.split(/[/\\]/).pop() ?? "Backend";
        state.collectionName = `${folderName} API`;
      }
    },
    setAiScannerCollectionName(state, action: PayloadAction<string>) {
      state.collectionName = action.payload;
    },
    setAiScannerBaseUrl(state, action: PayloadAction<string>) {
      state.baseUrl = action.payload;
    },
    setAiScannerGenerateMocks(state, action: PayloadAction<boolean>) {
      state.generateMocks = action.payload;
    },
    setAiScannerDetectAuth(state, action: PayloadAction<boolean>) {
      state.detectAuth = action.payload;
    },
    setAiScannerCreateEnvironment(state, action: PayloadAction<boolean>) {
      state.createEnvironment = action.payload;
    },
    setAiScanProgress(state, action: PayloadAction<AiScanProgress>) {
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
      state.selectedEndpointIds = state.endpoints.map((e) => e.id);
    },
    deselectAllEndpoints(state) {
      state.selectedEndpointIds = [];
    },
    setActiveMethodFilter(state, action: PayloadAction<string>) {
      state.activeMethodFilter = action.payload;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setSelectedPreviewEndpointId(state, action: PayloadAction<string | null>) {
      state.selectedPreviewEndpointId = action.payload;
    },
    setAiScannerError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(pickAiScanFolder.fulfilled, (state, action) => {
        if (action.payload) {
          state.projectPath = action.payload;
          const folderName = action.payload.split(/[/\\]/).pop() ?? "Backend";
          state.collectionName = `${folderName} API`;
        }
      })
      .addCase(runAiCodebaseScan.pending, (state) => {
        state.step = "scanning";
        state.error = null;
        state.progress = {
          currentFile: "Initializing static code harvester...",
          filesScanned: 0,
          totalFiles: 0,
          endpointsFound: 0,
        };
      })
      .addCase(runAiCodebaseScan.fulfilled, (state, action) => {
        state.summary = action.payload;
        state.endpoints = action.payload.endpoints;
        state.selectedEndpointIds = action.payload.endpoints.map((e) => e.id);
        state.selectedPreviewEndpointId = action.payload.endpoints[0]?.id ?? null;
        state.step = "review";
      })
      .addCase(runAiCodebaseScan.rejected, (state, action) => {
        state.step = "select";
        state.error = action.error.message || "AI codebase scan failed";
      })
      .addCase(importAiScanEndpoints.pending, (state) => {
        state.step = "importing";
        state.error = null;
      })
      .addCase(importAiScanEndpoints.fulfilled, (state) => {
        state.step = "done";
      })
      .addCase(importAiScanEndpoints.rejected, (state, action) => {
        state.step = "review";
        state.error = action.error.message || "Failed to import endpoints";
      });
  },
});

export const {
  openAiScanner,
  closeAiScanner,
  setAiScannerStep,
  setAiScannerProjectPath,
  setAiScannerCollectionName,
  setAiScannerBaseUrl,
  setAiScannerGenerateMocks,
  setAiScannerDetectAuth,
  setAiScannerCreateEnvironment,
  setAiScanProgress,
  setSelectedEndpointIds,
  toggleEndpointSelection,
  selectAllEndpoints,
  deselectAllEndpoints,
  setActiveMethodFilter,
  setSearchQuery,
  setSelectedPreviewEndpointId,
  setAiScannerError,
} = aiScannerSlice.actions;

export default aiScannerSlice.reducer;
