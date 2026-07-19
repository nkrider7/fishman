import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface NetworkLogEntry {
  id: string;
  method: string;
  statusCode: number | null;
  url: string;
  domain: string;
  path: string;
  startedAt: number;
  durationMs: number | null;
  sizeBytes: number | null;
  tabId?: string;
  error?: string;
}

interface NetworkLogState {
  entries: NetworkLogEntry[];
  selectedId: string | null;
}

const MAX_ENTRIES = 500;

const initialState: NetworkLogState = {
  entries: [],
  selectedId: null,
};

const networkLogSlice = createSlice({
  name: "networkLog",
  initialState,
  reducers: {
    appendNetworkLog: (state, action: PayloadAction<NetworkLogEntry>) => {
      state.entries.unshift(action.payload);
      if (state.entries.length > MAX_ENTRIES) {
        state.entries.length = MAX_ENTRIES;
      }
    },
    clearNetworkLog: (state) => {
      state.entries = [];
      state.selectedId = null;
    },
    selectNetworkLogEntry: (state, action: PayloadAction<string | null>) => {
      state.selectedId = action.payload;
    },
  },
});

export const { appendNetworkLog, clearNetworkLog, selectNetworkLogEntry } =
  networkLogSlice.actions;
export default networkLogSlice.reducer;
