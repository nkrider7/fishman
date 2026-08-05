import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { WsConnectionStatus, WsLogEntry } from "@/types/websocket";

/** Max messages retained per tab to bound memory (oldest dropped first). */
export const WS_LOG_LIMIT = 2000;

export type WsLogFilter = "all" | "incoming" | "outgoing" | "system";

export interface WsTabState {
  status: WsConnectionStatus;
  sessionId: string | null;
  messages: WsLogEntry[];
  /** True once the log has been truncated to the cap. */
  truncated: boolean;
  error: string | null;
  connectedAt: number | null;
  sentCount: number;
  receivedCount: number;
  filter: WsLogFilter;
  reconnectAttempts: number;
  closeCode: number | null;
  closeReason: string | null;
}

interface WebSocketState {
  byTab: Record<string, WsTabState>;
}

const initialState: WebSocketState = {
  byTab: {},
};

function emptyTab(): WsTabState {
  return {
    status: "idle",
    sessionId: null,
    messages: [],
    truncated: false,
    error: null,
    connectedAt: null,
    sentCount: 0,
    receivedCount: 0,
    filter: "all",
    reconnectAttempts: 0,
    closeCode: null,
    closeReason: null,
  };
}

function ensureTab(state: WebSocketState, tabId: string): WsTabState {
  let tab = state.byTab[tabId];
  if (!tab) {
    tab = emptyTab();
    state.byTab[tabId] = tab;
  }
  return tab;
}

const websocketSlice = createSlice({
  name: "websocket",
  initialState,
  reducers: {
    wsSessionStarted: (
      state,
      action: PayloadAction<{ tabId: string; sessionId: string }>,
    ) => {
      const tab = ensureTab(state, action.payload.tabId);
      tab.status = "connecting";
      tab.sessionId = action.payload.sessionId;
      tab.error = null;
      tab.closeCode = null;
      tab.closeReason = null;
    },
    wsStatusChanged: (
      state,
      action: PayloadAction<{
        tabId: string;
        status: WsConnectionStatus;
        code?: number | null;
        reason?: string | null;
      }>,
    ) => {
      const tab = ensureTab(state, action.payload.tabId);
      tab.status = action.payload.status;
      if (action.payload.status === "open") {
        tab.connectedAt = Date.now();
        tab.error = null;
        tab.reconnectAttempts = 0;
      }
      if (action.payload.status === "closed") {
        tab.connectedAt = null;
        tab.sessionId = null;
        tab.closeCode = action.payload.code ?? null;
        tab.closeReason = action.payload.reason ?? null;
      }
    },
    wsMessageLogged: (
      state,
      action: PayloadAction<{ tabId: string; entry: WsLogEntry }>,
    ) => {
      const tab = ensureTab(state, action.payload.tabId);
      tab.messages.push(action.payload.entry);
      if (action.payload.entry.direction === "incoming") tab.receivedCount += 1;
      if (action.payload.entry.direction === "outgoing") tab.sentCount += 1;
      if (tab.messages.length > WS_LOG_LIMIT) {
        tab.messages.splice(0, tab.messages.length - WS_LOG_LIMIT);
        tab.truncated = true;
      }
    },
    /** Batch many inbound frames into one store update (rAF-coalesced). */
    wsMessagesLogged: (
      state,
      action: PayloadAction<{ tabId: string; entries: WsLogEntry[] }>,
    ) => {
      const { tabId, entries } = action.payload;
      if (entries.length === 0) return;
      const tab = ensureTab(state, tabId);
      for (const entry of entries) {
        tab.messages.push(entry);
        if (entry.direction === "incoming") tab.receivedCount += 1;
        if (entry.direction === "outgoing") tab.sentCount += 1;
      }
      if (tab.messages.length > WS_LOG_LIMIT) {
        tab.messages.splice(0, tab.messages.length - WS_LOG_LIMIT);
        tab.truncated = true;
      }
    },
    wsErrorSet: (
      state,
      action: PayloadAction<{ tabId: string; message: string }>,
    ) => {
      const tab = ensureTab(state, action.payload.tabId);
      tab.error = action.payload.message;
      tab.status = "error";
    },
    wsLogCleared: (state, action: PayloadAction<string>) => {
      const tab = state.byTab[action.payload];
      if (!tab) return;
      tab.messages = [];
      tab.truncated = false;
      tab.sentCount = 0;
      tab.receivedCount = 0;
    },
    wsFilterChanged: (
      state,
      action: PayloadAction<{ tabId: string; filter: WsLogFilter }>,
    ) => {
      const tab = ensureTab(state, action.payload.tabId);
      tab.filter = action.payload.filter;
    },
    wsReconnectAttempted: (state, action: PayloadAction<string>) => {
      const tab = ensureTab(state, action.payload);
      tab.reconnectAttempts += 1;
    },
    wsSessionCleared: (state, action: PayloadAction<string>) => {
      delete state.byTab[action.payload];
    },
  },
});

export const {
  wsSessionStarted,
  wsStatusChanged,
  wsMessageLogged,
  wsMessagesLogged,
  wsErrorSet,
  wsLogCleared,
  wsFilterChanged,
  wsReconnectAttempted,
  wsSessionCleared,
} = websocketSlice.actions;

export default websocketSlice.reducer;
