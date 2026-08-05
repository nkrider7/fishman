import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppSettings, Theme, WorkspaceLayout } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";
import * as db from "@/services/dbService";

interface SettingsState extends AppSettings {
  loaded: boolean;
}

const initialState: SettingsState = {
  ...DEFAULT_SETTINGS,
  loaded: false,
};

/** Strip runtime-only fields before writing settings to the DB. */
export function toAppSettings(state: SettingsState): AppSettings {
  return {
    theme: state.theme,
    ignoreSsl: state.ignoreSsl,
    timeoutMs: state.timeoutMs,
    sidebarCollapsed: state.sidebarCollapsed,
    workspaceLayout: state.workspaceLayout,
    zoomLevel: state.zoomLevel,
    activeGlobalEnvironmentId: state.activeGlobalEnvironmentId,
    activeCollectionEnvironmentIds: state.activeCollectionEnvironmentIds,
  };
}

export const loadSettings = createAsyncThunk("settings/load", async () => {
  return db.getSettings();
});

export const persistSettings = createAsyncThunk(
  "settings/persist",
  async (settings: AppSettings) => {
    await db.saveSettings(settings);
    return settings;
  },
);

/** Merge partial settings into the current state and persist. */
export const persistSettingsPatch = createAsyncThunk(
  "settings/persistPatch",
  async (changes: Partial<AppSettings>, { getState }) => {
    const current = toAppSettings(
      (getState() as { settings: SettingsState }).settings,
    );
    const next: AppSettings = { ...current, ...changes };
    await db.saveSettings(next);
    return next;
  },
);

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload;
    },
    setIgnoreSsl: (state, action: PayloadAction<boolean>) => {
      state.ignoreSsl = action.payload;
    },
    setTimeoutMs: (state, action: PayloadAction<number>) => {
      state.timeoutMs = action.payload;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    setWorkspaceLayout: (state, action: PayloadAction<WorkspaceLayout>) => {
      state.workspaceLayout = action.payload;
    },
    setZoomLevel: (state, action: PayloadAction<number>) => {
      state.zoomLevel = action.payload;
    },
    updateSettings: (state, action: PayloadAction<Partial<AppSettings>>) => {
      Object.assign(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSettings.fulfilled, (state, action) => {
        Object.assign(state, action.payload);
        state.loaded = true;
      })
      .addCase(persistSettings.fulfilled, (state, action) => {
        Object.assign(state, action.payload);
      })
      .addCase(persistSettingsPatch.fulfilled, (state, action) => {
        Object.assign(state, action.payload);
      });
  },
});

export const {
  setTheme,
  setIgnoreSsl,
  setTimeoutMs,
  setSidebarCollapsed,
  setWorkspaceLayout,
  setZoomLevel,
  updateSettings,
} = settingsSlice.actions;
export default settingsSlice.reducer;
