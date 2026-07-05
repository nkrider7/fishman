import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppSettings, Theme } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";
import * as db from "@/services/dbService";

interface SettingsState extends AppSettings {
  loaded: boolean;
}

const initialState: SettingsState = {
  ...DEFAULT_SETTINGS,
  loaded: false,
};

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
      });
  },
});

export const {
  setTheme,
  setIgnoreSsl,
  setTimeoutMs,
  setSidebarCollapsed,
  updateSettings,
} = settingsSlice.actions;
export default settingsSlice.reducer;
