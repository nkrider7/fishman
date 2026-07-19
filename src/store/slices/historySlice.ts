import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { HistoryEntry } from "@/types/history";
import * as db from "@/services/dbService";
import type { RootState } from "../index";

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
}

const initialState: HistoryState = {
  entries: [],
  loading: false,
};

export const fetchHistory = createAsyncThunk(
  "history/fetch",
  async (_arg, { getState }) => {
    const state = getState() as RootState;
    return db.getHistory(state.workspaces.activeWorkspaceId);
  },
);

export const addHistory = createAsyncThunk(
  "history/add",
  async (
    entry: Omit<HistoryEntry, "id" | "created_at">,
    { getState },
  ) => {
    const state = getState() as RootState;
    return db.addHistoryEntry(entry, state.workspaces.activeWorkspaceId);
  },
);

export const clearAllHistory = createAsyncThunk(
  "history/clear",
  async (_arg, { getState }) => {
    const state = getState() as RootState;
    await db.clearHistory(state.workspaces.activeWorkspaceId);
  },
);

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    replaceHistory(state, action: { payload: HistoryEntry[] }) {
      state.entries = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHistory.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchHistory.fulfilled, (state, action) => {
        state.entries = action.payload;
        state.loading = false;
      })
      .addCase(addHistory.fulfilled, (state, action) => {
        state.entries.unshift(action.payload);
      })
      .addCase(clearAllHistory.fulfilled, (state) => {
        state.entries = [];
      });
  },
});

export const { replaceHistory } = historySlice.actions;
export default historySlice.reducer;
