/**
 * WebSocket domain types.
 *
 * Raw WebSocket support is modelled as a live duplex session (see the terminal
 * PTY pattern) rather than the one-shot HTTP request/response flow.
 */

/** Message content type used by the composer and saved templates. */
export type WsMessageType = "text" | "json" | "binary";

/** Frame opcode surfaced from the backend. */
export type WsOpcode = "text" | "binary" | "ping" | "pong" | "close";

/** Direction of a logged message relative to the client. */
export type WsDirection = "incoming" | "outgoing" | "system";

/** Live connection lifecycle state (frontend view). */
export type WsConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "error";

/** A saved outgoing message template stored on the request. */
export interface WsMessageTemplate {
  id: string;
  name: string;
  type: WsMessageType;
  /** Text/JSON content, or base64 for binary. */
  body: string;
}

/** Persisted WebSocket configuration attached to a request draft. */
export interface WsConfig {
  /** Default composer content type. */
  messageType: WsMessageType;
  /** Saved outgoing message templates. */
  messages: WsMessageTemplate[];
  /** Sec-WebSocket-Protocol subprotocols offered during the handshake. */
  protocols: string[];
  autoReconnect: boolean;
  reconnectIntervalMs: number;
  maxReconnectAttempts: number;
  /** Show ping/pong/close frames in the message timeline. */
  showSystemFrames: boolean;
}

export const DEFAULT_WS_URL = "wss://echo.websocket.events";

export function createDefaultWsConfig(): WsConfig {
  return {
    messageType: "text",
    messages: [],
    protocols: [],
    autoReconnect: false,
    reconnectIntervalMs: 2000,
    maxReconnectAttempts: 5,
    showSystemFrames: false,
  };
}

/** A single entry in the message timeline (in-memory only). */
export interface WsLogEntry {
  id: string;
  direction: WsDirection;
  opcode: WsOpcode | "system";
  /** Decoded text, or base64 for binary frames. */
  data: string;
  encoding: "utf8" | "base64";
  size: number;
  timestamp: number;
}

/* ---- Tauri command / event payload shapes ---- */

export interface WsConnectArgs {
  sessionId: string;
  url: string;
  headers?: Record<string, string>;
  protocols?: string[];
}

export interface WsMessageEvent {
  sessionId: string;
  direction: WsDirection;
  opcode: WsOpcode;
  data: string;
  encoding: "utf8" | "base64";
  size: number;
  timestamp: number;
}

export interface WsStatusEvent {
  sessionId: string;
  status: "connecting" | "open" | "closing" | "closed";
  code?: number;
  reason?: string;
  timestamp: number;
}

export interface WsErrorEvent {
  sessionId: string;
  message: string;
  timestamp: number;
}
