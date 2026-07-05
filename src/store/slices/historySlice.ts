import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { HistoryEntry } from "@/types/history";
import * as db from "@/services/dbService";

interface HistoryState {
  entries: HistoryEntry[];
  loading: boolean;
}

const initialState: HistoryState = {
  entries: [],
  loading: false,
};

export const fetchHistory = createAsyncThunk("history/fetch", async () => {
  return db.getHistory();
});

export const addHistory = createAsyncThunk(
  "history/add",
  async (entry: Omit<HistoryEntry, "id" | "created_at">) => {
    return db.addHistoryEntry(entry);
  },
);

export const clearAllHistory = createAsyncThunk("history/clear", async () => {
  await db.clearHistory();
});

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {},
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

export default historySlice.reducer;
