import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ResponseTiming } from "@/types/response";

export type NetworkLogLevel = "info" | "request" | "success" | "warn" | "error";

export interface NetworkTraceLine {
  at: number;
  level: NetworkLogLevel;
  message: string;
}

export type NetworkProxyMode = "system" | "none" | "custom";

export interface NetworkLogEntry {
  id: string;
  method: string;
  statusCode: number | null;
  statusText?: string | null;
  url: string;
  finalUrl?: string | null;
  domain: string;
  path: string;
  startedAt: number;
  durationMs: number | null;
  sizeBytes: number | null;
  tabId?: string;
  error?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string | null;
  responseHeaders?: Record<string, string>;
  responseBody?: string | null;
  responseBodyTruncated?: boolean;
  timing?: ResponseTiming;
  proxyMode?: NetworkProxyMode;
  trace?: NetworkTraceLine[];
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
