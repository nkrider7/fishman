import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { createTauriGitNativeFs } from "@/git-native";
import {
  applyEnvDetectToWorkspace,
  defaultAcceptedIds,
  scanProjectEnv,
  type EnvDetectConflictPolicy,
  type EnvDetectReport,
} from "@/env-detect";
import {
  createEnvironment,
  fetchEnvironments,
  setActiveGlobalEnvironment,
  setSelectedEnvironmentId,
  updateEnvironment,
} from "@/store/slices/environmentSlice";
import { createKeyValue, type KeyValue } from "@/types/request";
import type { RootState } from "@/store";

interface EnvDetectState {
  open: boolean;
  scanning: boolean;
  applying: boolean;
  report: EnvDetectReport | null;
  selectedIds: string[];
  envName: string;
  conflictPolicy: EnvDetectConflictPolicy;
  error: string | null;
  lastApplySummary: string | null;
}

const initialState: EnvDetectState = {
  open: false,
  scanning: false,
  applying: false,
  report: null,
  selectedIds: [],
  envName: "local",
  conflictPolicy: "skip",
  error: null,
  lastApplySummary: null,
};

export const openEnvDetect = createAsyncThunk(
  "envDetect/open",
  async (_arg, { getState, dispatch }) => {
    const state = getState() as RootState;
    const projectPath = state.git.projectPath;
    if (!projectPath) {
      throw new Error(
        "Open a project folder first (File → Open project) to detect environment variables.",
      );
    }
    void dispatch(runEnvDetectScan());
    return { projectPath };
  },
);

export const runEnvDetectScan = createAsyncThunk(
  "envDetect/scan",
  async (_arg, { getState }) => {
    const state = getState() as RootState;
    const projectPath = state.git.projectPath;
    if (!projectPath) {
      throw new Error("No project folder is open.");
    }
    const fs = createTauriGitNativeFs();
    return scanProjectEnv({ projectPath, fs });
  },
);

export const applyEnvDetect = createAsyncThunk(
  "envDetect/apply",
  async (_arg, { getState, dispatch }) => {
    const state = getState() as RootState;
    const { report, selectedIds, envName, conflictPolicy } = state.envDetect;
    const workspaceRootPath = state.git.workspaceRootPath;
    const projectPath = state.git.projectPath;

    if (!report) {
      throw new Error("Run detection before applying.");
    }
    if (selectedIds.length === 0) {
      throw new Error("Select at least one variable to apply.");
    }
    if (!projectPath) {
      throw new Error("No project folder is open.");
    }

    const fs = createTauriGitNativeFs();
    let diskResult: Awaited<ReturnType<typeof applyEnvDetectToWorkspace>> | null =
      null;

    if (workspaceRootPath && state.collections.sourceMode === "filesystem") {
      diskResult = await applyEnvDetectToWorkspace({
        fs,
        workspaceRootPath,
        report,
        envName: envName.trim() || "local",
        acceptedIds: selectedIds,
        conflictPolicy,
      });
    }

    // Mirror into SQLite global environments so Environment Manager + {{vars}} resolve.
    const accepted = report.variables.filter((v) => selectedIds.includes(v.id));
    const mirrorVars: KeyValue[] = (diskResult?.variables ?? accepted).map(
      (v) => ({
        id: ("id" in v && v.id) || crypto.randomUUID(),
        key: v.key,
        value: v.value,
        enabled: v.enabled !== false,
      }),
    );

    // If we only have accepted detections (no disk write), still merge into SQLite.
    const name = (envName.trim() || "local");
    const existing = state.environments.globalEnvironments.find(
      (e) => e.name.toLowerCase() === name.toLowerCase(),
    );

    if (diskResult) {
      // Prefer full merged list from disk apply.
      const kv = diskResult.variables.map((v) => ({
        id: v.id ?? crypto.randomUUID(),
        key: v.key,
        value: v.value,
        enabled: v.enabled !== false,
      }));
      if (existing) {
        await dispatch(
          updateEnvironment({ id: existing.id, name: existing.name, variables: kv }),
        ).unwrap();
        dispatch(setSelectedEnvironmentId(existing.id));
        dispatch(setActiveGlobalEnvironment(existing.id));
      } else {
        const created = await dispatch(
          createEnvironment({ name, variables: kv }),
        ).unwrap();
        dispatch(setSelectedEnvironmentId(created.id));
        dispatch(setActiveGlobalEnvironment(created.id));
      }
    } else {
      // SQLite-only path (should be rare without workspace root).
      if (existing) {
        const byKey = new Map(existing.variables.map((v) => [v.key, v]));
        for (const row of mirrorVars) {
          const prev = byKey.get(row.key);
          if (!prev) {
            byKey.set(row.key, row);
          } else if (
            conflictPolicy === "overwrite" ||
            prev.value === "" ||
            prev.value === row.value
          ) {
            byKey.set(row.key, { ...prev, value: row.value, enabled: row.enabled });
          }
        }
        await dispatch(
          updateEnvironment({
            id: existing.id,
            name: existing.name,
            variables: [...byKey.values()],
          }),
        ).unwrap();
        dispatch(setSelectedEnvironmentId(existing.id));
        dispatch(setActiveGlobalEnvironment(existing.id));
      } else {
        const created = await dispatch(
          createEnvironment({
            name,
            variables: mirrorVars.length
              ? mirrorVars
              : [createKeyValue()],
          }),
        ).unwrap();
        dispatch(setSelectedEnvironmentId(created.id));
        dispatch(setActiveGlobalEnvironment(created.id));
      }
    }

    await dispatch(fetchEnvironments());

    const added = diskResult?.added ?? mirrorVars.length;
    const updated = diskResult?.updated ?? 0;
    const skipped = diskResult?.skipped ?? 0;
    const secretPath = diskResult?.secretsRelativePath;

    return {
      summary: [
        `Applied to environment “${name}”`,
        added ? `+${added} added` : null,
        updated ? `${updated} updated` : null,
        skipped ? `${skipped} skipped` : null,
        secretPath ? `secrets → ${secretPath}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  },
);

const envDetectSlice = createSlice({
  name: "envDetect",
  initialState,
  reducers: {
    closeEnvDetect(state) {
      state.open = false;
      state.error = null;
      state.scanning = false;
      state.applying = false;
    },
    setEnvDetectSelectedIds(state, action: PayloadAction<string[]>) {
      state.selectedIds = action.payload;
    },
    toggleEnvDetectId(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.selectedIds.includes(id)) {
        state.selectedIds = state.selectedIds.filter((x) => x !== id);
      } else {
        state.selectedIds.push(id);
      }
    },
    selectHighConfidenceEnvDetect(state) {
      if (!state.report) return;
      state.selectedIds = defaultAcceptedIds(state.report.variables);
    },
    selectAllEnvDetect(state) {
      if (!state.report) return;
      state.selectedIds = state.report.variables.map((v) => v.id);
    },
    clearEnvDetectSelection(state) {
      state.selectedIds = [];
    },
    setEnvDetectEnvName(state, action: PayloadAction<string>) {
      state.envName = action.payload;
    },
    setEnvDetectConflictPolicy(
      state,
      action: PayloadAction<EnvDetectConflictPolicy>,
    ) {
      state.conflictPolicy = action.payload;
    },
    clearEnvDetectError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(openEnvDetect.pending, (state) => {
        state.error = null;
        state.lastApplySummary = null;
      })
      .addCase(openEnvDetect.fulfilled, (state) => {
        state.open = true;
      })
      .addCase(openEnvDetect.rejected, (state, action) => {
        state.open = true;
        state.error = action.error.message ?? "Could not open env detect";
      })
      .addCase(runEnvDetectScan.pending, (state) => {
        state.scanning = true;
        state.error = null;
        state.report = null;
        state.selectedIds = [];
      })
      .addCase(runEnvDetectScan.fulfilled, (state, action) => {
        state.scanning = false;
        state.report = action.payload;
        state.envName = action.payload.suggestedEnvName;
        state.selectedIds = defaultAcceptedIds(action.payload.variables);
      })
      .addCase(runEnvDetectScan.rejected, (state, action) => {
        state.scanning = false;
        state.error = action.error.message ?? "Scan failed";
      })
      .addCase(applyEnvDetect.pending, (state) => {
        state.applying = true;
        state.error = null;
        state.lastApplySummary = null;
      })
      .addCase(applyEnvDetect.fulfilled, (state, action) => {
        state.applying = false;
        state.lastApplySummary = action.payload.summary;
        state.open = false;
      })
      .addCase(applyEnvDetect.rejected, (state, action) => {
        state.applying = false;
        state.error = action.error.message ?? "Apply failed";
      });
  },
});

export const {
  closeEnvDetect,
  setEnvDetectSelectedIds,
  toggleEnvDetectId,
  selectHighConfidenceEnvDetect,
  selectAllEnvDetect,
  clearEnvDetectSelection,
  setEnvDetectEnvName,
  setEnvDetectConflictPolicy,
  clearEnvDetectError,
} = envDetectSlice.actions;

export default envDetectSlice.reducer;
