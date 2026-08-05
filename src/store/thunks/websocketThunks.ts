import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { selectResolvedVariables } from "../slices/environmentSlice";
import {
  wsErrorSet,
  wsMessageLogged,
  wsMessagesLogged,
  wsReconnectAttempted,
  wsSessionCleared,
  wsSessionStarted,
  wsStatusChanged,
} from "../slices/websocketSlice";
import {
  isWebSocketAvailable,
  onWebSocketError,
  onWebSocketMessage,
  onWebSocketStatus,
  wsClose,
  wsConnect,
  wsSend,
} from "@/tauri/websocket";
import type { WsLogEntry, WsMessageType } from "@/types/websocket";
import { createDefaultWsConfig } from "@/types/websocket";
import { isWebSocketRequest } from "@/types/request";
import { findRootCollectionId } from "@/utils/collectionUtils";
import { applyAuthToHeaders, syncUrlWithParams } from "@/utils/requestBuilder";
import { substituteRequestDraft } from "@/utils/variableSubstitution";
import { isWebSocketUrl, suggestWebSocketUrl, validateJson } from "@/utils/websocket";
import { generateId } from "@/utils/id";

/** sessionId → tabId for routing Tauri events into the correct tab. */
const sessionToTab = new Map<string, string>();

/** Promise gate so concurrent connect calls don't race past listener setup. */
let listenersReady: Promise<void> | null = null;

/** Per-tab inbound frame buffer flushed once per animation frame. */
const pendingMessages = new Map<string, WsLogEntry[]>();
let flushRaf: number | null = null;
let messageDispatch: ((action: unknown) => unknown) | null = null;

function flushPendingMessages() {
  flushRaf = null;
  const dispatch = messageDispatch;
  if (!dispatch) {
    pendingMessages.clear();
    return;
  }
  for (const [tabId, entries] of pendingMessages) {
    if (entries.length === 0) continue;
    dispatch(wsMessagesLogged({ tabId, entries }));
  }
  pendingMessages.clear();
}

function enqueueIncomingMessage(tabId: string, entry: WsLogEntry) {
  let list = pendingMessages.get(tabId);
  if (!list) {
    list = [];
    pendingMessages.set(tabId, list);
  }
  list.push(entry);
  if (flushRaf == null) {
    flushRaf = requestAnimationFrame(flushPendingMessages);
  }
}

function buildLogEntry(
  partial: Omit<WsLogEntry, "id"> & { id?: string },
): WsLogEntry {
  return {
    id: partial.id ?? generateId(),
    direction: partial.direction,
    opcode: partial.opcode,
    data: partial.data,
    encoding: partial.encoding,
    size: partial.size,
    timestamp: partial.timestamp,
  };
}

async function ensureGlobalListeners(
  dispatch: (action: unknown) => unknown,
): Promise<void> {
  if (listenersReady) return listenersReady;

  listenersReady = (async () => {
    messageDispatch = dispatch;

    await onWebSocketMessage((event) => {
      const tabId = sessionToTab.get(event.sessionId);
      if (!tabId) return;
      enqueueIncomingMessage(
        tabId,
        buildLogEntry({
          direction: event.direction,
          opcode: event.opcode,
          data: event.data,
          encoding: event.encoding,
          size: event.size,
          timestamp: event.timestamp,
        }),
      );
    });

    await onWebSocketStatus((event) => {
      const tabId = sessionToTab.get(event.sessionId);
      if (!tabId) return;
      dispatch(
        wsStatusChanged({
          tabId,
          status: event.status,
          code: event.code ?? null,
          reason: event.reason ?? null,
        }),
      );
      if (event.status === "open") {
        dispatch(
          wsMessageLogged({
            tabId,
            entry: buildLogEntry({
              direction: "system",
              opcode: "system",
              data: "Connected",
              encoding: "utf8",
              size: 0,
              timestamp: event.timestamp,
            }),
          }),
        );
      }
      if (event.status === "closed") {
        sessionToTab.delete(event.sessionId);
        const detail =
          event.code != null
            ? `Disconnected (${event.code}${event.reason ? `: ${event.reason}` : ""})`
            : "Disconnected";
        dispatch(
          wsMessageLogged({
            tabId,
            entry: buildLogEntry({
              direction: "system",
              opcode: "system",
              data: detail,
              encoding: "utf8",
              size: 0,
              timestamp: event.timestamp,
            }),
          }),
        );
      }
    });

    await onWebSocketError((event) => {
      const tabId = sessionToTab.get(event.sessionId);
      if (!tabId) return;
      dispatch(wsErrorSet({ tabId, message: event.message }));
      dispatch(
        wsMessageLogged({
          tabId,
          entry: buildLogEntry({
            direction: "system",
            opcode: "system",
            data: event.message,
            encoding: "utf8",
            size: event.message.length,
            timestamp: event.timestamp,
          }),
        }),
      );
    });
  })();

  try {
    await listenersReady;
  } catch (err) {
    listenersReady = null;
    throw err;
  }
}

function resolveConnectUrlAndHeaders(
  state: RootState,
  tabId: string,
): { url: string; headers: Record<string, string>; protocols: string[] } {
  const draft = state.request.drafts[tabId];
  if (!draft) throw new Error("No request draft found");
  if (!isWebSocketRequest(draft)) {
    throw new Error("Active tab is not a WebSocket request");
  }

  const rootCollectionId = findRootCollectionId(
    draft.collectionId,
    state.collections.folders,
  );
  const variables = selectResolvedVariables(state, rootCollectionId);
  const resolved = substituteRequestDraft(draft, variables);
  const withParams = syncUrlWithParams(resolved.url, resolved.params);
  let url = withParams.trim();

  const upgraded = suggestWebSocketUrl(url);
  if (upgraded) url = upgraded;

  if (!isWebSocketUrl(url)) {
    throw new Error("URL must be a valid ws:// or wss:// address");
  }

  const headersList = applyAuthToHeaders(resolved.headers, resolved.auth);
  const headers: Record<string, string> = {};
  for (const h of headersList) {
    if (!h.enabled || !h.key.trim()) continue;
    headers[h.key.trim()] = h.value;
  }

  // API key in query (already applied via syncUrlWithParams params when present
  // on draft; applyAuth only adds header form — mirror HTTP query path):
  if (
    resolved.auth.type === "apikey" &&
    resolved.auth.apikey?.addTo === "query" &&
    resolved.auth.apikey.key
  ) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set(
        resolved.auth.apikey.key,
        resolved.auth.apikey.value,
      );
      url = parsed.toString();
    } catch {
      // URL already validated as ws/wss
    }
  }

  const ws = resolved.websocket ?? createDefaultWsConfig();
  return {
    url,
    headers,
    protocols: (ws.protocols ?? []).map((p) => p.trim()).filter(Boolean),
  };
}

export const connectWebSocketThunk = createAsyncThunk(
  "websocket/connect",
  async (tabId: string, { getState, dispatch }) => {
    if (!isWebSocketAvailable()) {
      dispatch(
        wsErrorSet({
          tabId,
          message: "WebSocket requires the Fishman desktop app (Tauri).",
        }),
      );
      throw new Error("WebSocket not available outside Tauri");
    }

    await ensureGlobalListeners(dispatch);

    const state = getState() as RootState;
    const existing = state.websocket.byTab[tabId];
    if (
      existing?.sessionId &&
      (existing.status === "open" || existing.status === "connecting")
    ) {
      return existing.sessionId;
    }

    let url: string;
    let headers: Record<string, string>;
    let protocols: string[];
    try {
      ({ url, headers, protocols } = resolveConnectUrlAndHeaders(state, tabId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch(wsErrorSet({ tabId, message }));
      throw err;
    }

    const sessionId = `ws-${generateId()}`;
    sessionToTab.set(sessionId, tabId);
    dispatch(wsSessionStarted({ tabId, sessionId }));

    try {
      await wsConnect({
        sessionId,
        url,
        headers,
        protocols: protocols.length > 0 ? protocols : undefined,
      });
      return sessionId;
    } catch (err) {
      sessionToTab.delete(sessionId);
      const message = err instanceof Error ? err.message : String(err);
      dispatch(wsErrorSet({ tabId, message }));
      dispatch(wsStatusChanged({ tabId, status: "closed" }));
      throw err;
    }
  },
);

export const disconnectWebSocketThunk = createAsyncThunk(
  "websocket/disconnect",
  async (tabId: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const tab = state.websocket.byTab[tabId];
    const sessionId = tab?.sessionId;
    if (!sessionId) {
      dispatch(wsStatusChanged({ tabId, status: "closed" }));
      return;
    }
    dispatch(wsStatusChanged({ tabId, status: "closing" }));
    try {
      await wsClose(sessionId, 1000, "Client disconnect");
    } catch {
      // Best-effort close; clear local mapping either way.
    }
    sessionToTab.delete(sessionId);
  },
);

export const sendWebSocketMessageThunk = createAsyncThunk(
  "websocket/send",
  async (
    payload: { tabId: string; type: WsMessageType; data: string },
    { getState, dispatch },
  ) => {
    const { tabId, type, data } = payload;
    const state = getState() as RootState;
    const tab = state.websocket.byTab[tabId];
    if (!tab?.sessionId || tab.status !== "open") {
      throw new Error("Connect before sending a message");
    }

    if (type === "json") {
      const jsonError = validateJson(data);
      if (jsonError) throw new Error(jsonError);
    }

    if (type === "binary") {
      // Composer stores binary as base64; empty is invalid.
      if (!data.trim()) throw new Error("Binary payload is empty");
    }

    await wsSend(tab.sessionId, type, data);

    const size =
      type === "binary"
        ? Math.floor((data.trim().length * 3) / 4) // rough base64 length
        : new TextEncoder().encode(data).length;

    dispatch(
      wsMessageLogged({
        tabId,
        entry: buildLogEntry({
          direction: "outgoing",
          opcode: type === "binary" ? "binary" : "text",
          data,
          encoding: type === "binary" ? "base64" : "utf8",
          size,
          timestamp: Date.now(),
        }),
      }),
    );
  },
);

/** Close any live session for a tab and drop its WS state (tab close / delete). */
export const cleanupWebSocketTabThunk = createAsyncThunk(
  "websocket/cleanupTab",
  async (tabId: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const tab = state.websocket.byTab[tabId];
    if (tab?.sessionId) {
      sessionToTab.delete(tab.sessionId);
      try {
        await wsClose(tab.sessionId, 1000, "Tab closed");
      } catch {
        // ignore
      }
    }
    dispatch(wsSessionCleared(tabId));
  },
);

export const reconnectWebSocketThunk = createAsyncThunk(
  "websocket/reconnect",
  async (tabId: string, { dispatch }) => {
    dispatch(wsReconnectAttempted(tabId));
    await dispatch(disconnectWebSocketThunk(tabId));
    return dispatch(connectWebSocketThunk(tabId)).unwrap();
  },
);
