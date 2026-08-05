import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  WsConnectArgs,
  WsErrorEvent,
  WsMessageEvent,
  WsMessageType,
  WsStatusEvent,
} from "@/types/websocket";

export function isWebSocketAvailable(): boolean {
  return isTauri();
}

export interface WsConnectResult {
  sessionId: string;
}

/**
 * Open a WebSocket connection. The `sessionId` is generated on the frontend so
 * event listeners can be registered before the backend races to emit `open`.
 */
export async function wsConnect(args: WsConnectArgs): Promise<WsConnectResult> {
  return invoke<WsConnectResult>("ws_connect", {
    sessionId: args.sessionId,
    url: args.url,
    headers: args.headers ?? null,
    protocols: args.protocols ?? null,
  });
}

export async function wsSend(
  sessionId: string,
  kind: WsMessageType,
  data: string,
): Promise<void> {
  // Backend distinguishes only binary vs text on the wire.
  const wireKind = kind === "binary" ? "binary" : "text";
  return invoke("ws_send", { sessionId, kind: wireKind, data });
}

export async function wsClose(
  sessionId: string,
  code?: number,
  reason?: string,
): Promise<void> {
  return invoke("ws_close", {
    sessionId,
    code: code ?? null,
    reason: reason ?? null,
  });
}

/* ---- Global, deduplicated event listeners ---- */

type MessageHandler = (event: WsMessageEvent) => void;
type StatusHandler = (event: WsStatusEvent) => void;
type ErrorHandler = (event: WsErrorEvent) => void;

const messageHandlers = new Set<MessageHandler>();
const statusHandlers = new Set<StatusHandler>();
const errorHandlers = new Set<ErrorHandler>();

let listenersReady: Promise<void> | null = null;

/**
 * Register the three Tauri event listeners exactly once for the app lifetime.
 * Individual subscribers filter by `sessionId` themselves.
 */
async function ensureListeners(): Promise<void> {
  if (listenersReady) return listenersReady;
  listenersReady = (async () => {
    const unlisten: UnlistenFn[] = [];
    unlisten.push(
      await listen<WsMessageEvent>("websocket://message", (e) => {
        for (const handler of messageHandlers) handler(e.payload);
      }),
    );
    unlisten.push(
      await listen<WsStatusEvent>("websocket://status", (e) => {
        for (const handler of statusHandlers) handler(e.payload);
      }),
    );
    unlisten.push(
      await listen<WsErrorEvent>("websocket://error", (e) => {
        for (const handler of errorHandlers) handler(e.payload);
      }),
    );
    // Listeners intentionally live for the whole session; `unlisten` is retained
    // only to avoid GC and is never called.
    void unlisten;
  })();
  return listenersReady;
}

export async function onWebSocketMessage(
  handler: MessageHandler,
): Promise<UnlistenFn> {
  await ensureListeners();
  messageHandlers.add(handler);
  return () => {
    messageHandlers.delete(handler);
  };
}

export async function onWebSocketStatus(
  handler: StatusHandler,
): Promise<UnlistenFn> {
  await ensureListeners();
  statusHandlers.add(handler);
  return () => {
    statusHandlers.delete(handler);
  };
}

export async function onWebSocketError(
  handler: ErrorHandler,
): Promise<UnlistenFn> {
  await ensureListeners();
  errorHandlers.add(handler);
  return () => {
    errorHandlers.delete(handler);
  };
}
