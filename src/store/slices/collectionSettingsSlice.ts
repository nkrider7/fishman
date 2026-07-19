import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { FolderSettings } from "@/types/collection";
import { EMPTY_FOLDER_SETTINGS } from "@/types/collection";

export type CollectionSettingsSubTab =
  | "overview"
  | "headers"
  | "vars"
  | "auth"
  | "script"
  | "tests"
  | "presets";

export interface CollectionSettingsDraft {
  folderId: string;
  name: string;
  settings: FolderSettings;
  dirty: boolean;
  activeSubTab: CollectionSettingsSubTab;
  tabId: string | null;
}

interface CollectionSettingsState {
  /** Active editing session (one at a time, like runner). */
  draft: CollectionSettingsDraft | null;
}

const initialState: CollectionSettingsState = {
  draft: null,
};

const collectionSettingsSlice = createSlice({
  name: "collectionSettings",
  initialState,
  reducers: {
    openSettingsDraft: (
      state,
      action: PayloadAction<{
        folderId: string;
        name: string;
        settings: FolderSettings;
        tabId: string;
        subTab?: CollectionSettingsSubTab;
        dirty?: boolean;
      }>,
    ) => {
      state.draft = {
        folderId: action.payload.folderId,
        name: action.payload.name,
        settings: action.payload.settings,
        dirty: action.payload.dirty ?? false,
        activeSubTab: action.payload.subTab ?? "overview",
        tabId: action.payload.tabId,
      };
    },
    patchSettingsDraft: (
      state,
      action: PayloadAction<Partial<FolderSettings>>,
    ) => {
      if (!state.draft) return;
      state.draft.settings = {
        ...state.draft.settings,
        ...action.payload,
      };
      state.draft.dirty = true;
    },
    setSettingsSubTab: (
      state,
      action: PayloadAction<CollectionSettingsSubTab>,
    ) => {
      if (!state.draft) return;
      state.draft.activeSubTab = action.payload;
    },
    markSettingsSaved: (
      state,
      action: PayloadAction<{ settings: FolderSettings; name?: string }>,
    ) => {
      if (!state.draft) return;
      state.draft.settings = action.payload.settings;
      if (action.payload.name) state.draft.name = action.payload.name;
      state.draft.dirty = false;
    },
    closeSettingsDraft: (state) => {
      state.draft = null;
    },
    resetSettingsDraft: (state) => {
      if (!state.draft) return;
      state.draft.settings = { ...EMPTY_FOLDER_SETTINGS };
      state.draft.dirty = true;
    },
  },
});

export const {
  openSettingsDraft,
  patchSettingsDraft,
  setSettingsSubTab,
  markSettingsSaved,
  closeSettingsDraft,
  resetSettingsDraft,
} = collectionSettingsSlice.actions;

export default collectionSettingsSlice.reducer;
