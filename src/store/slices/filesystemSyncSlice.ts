import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AutoSaveStatus } from "@/git-native";

interface FilesystemSyncState {
  /** Auto-save status for status bar. */
  autoSave: AutoSaveStatus;
  /** Tab ids with unsaved edits whose disk file changed externally. */
  diskChangedTabIds: string[];
  watcherActive: boolean;
  watcherError: string | null;
}

const initialState: FilesystemSyncState = {
  autoSave: { kind: "idle" },
  diskChangedTabIds: [],
  watcherActive: false,
  watcherError: null,
};

const filesystemSyncSlice = createSlice({
  name: "filesystemSync",
  initialState,
  reducers: {
    setAutoSaveStatus: (state, action: PayloadAction<AutoSaveStatus>) => {
      state.autoSave = action.payload;
    },
    setDiskChangedTabIds: (state, action: PayloadAction<string[]>) => {
      state.diskChangedTabIds = action.payload;
    },
    clearDiskChangedTab: (state, action: PayloadAction<string>) => {
      state.diskChangedTabIds = state.diskChangedTabIds.filter(
        (id) => id !== action.payload,
      );
    },
    setWatcherActive: (state, action: PayloadAction<boolean>) => {
      state.watcherActive = action.payload;
    },
    setWatcherError: (state, action: PayloadAction<string | null>) => {
      state.watcherError = action.payload;
    },
    resetFilesystemSync: () => initialState,
  },
});

export const {
  setAutoSaveStatus,
  setDiskChangedTabIds,
  clearDiskChangedTab,
  setWatcherActive,
  setWatcherError,
  resetFilesystemSync,
} = filesystemSyncSlice.actions;

export default filesystemSyncSlice.reducer;
