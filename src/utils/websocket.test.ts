import { describe, expect, it } from "vitest";
import {
  formatWsSize,
  isWebSocketUrl,
  looksLikeJson,
  suggestWebSocketUrl,
  tryPrettyJson,
  validateJson,
} from "./websocket";
import {
  WS_LOG_LIMIT,
  wsErrorSet,
  wsLogCleared,
  wsMessageLogged,
  wsSessionStarted,
  wsStatusChanged,
} from "@/store/slices/websocketSlice";
import websocketReducer from "@/store/slices/websocketSlice";
import {
  createWebSocketRequest,
  isWebSocketRequest,
} from "@/types/request";
import { createDefaultWsConfig } from "@/types/websocket";
import { requestDraftToFish, fishRequestToDraft } from "@/git-native/codec/map-draft";

describe("isWebSocketUrl", () => {
  it("accepts ws and wss URLs", () => {
    expect(isWebSocketUrl("wss://echo.websocket.events")).toBe(true);
    expect(isWebSocketUrl("ws://localhost:8080/socket")).toBe(true);
  });

  it("rejects http and bare hosts", () => {
    expect(isWebSocketUrl("https://example.com")).toBe(false);
    expect(isWebSocketUrl("example.com")).toBe(false);
    expect(isWebSocketUrl("wss://")).toBe(false);
  });
});

describe("suggestWebSocketUrl", () => {
  it("upgrades http(s) to ws(s)", () => {
    expect(suggestWebSocketUrl("https://api.example.com/ws")).toBe(
      "wss://api.example.com/ws",
    );
    expect(suggestWebSocketUrl("http://localhost:3000")).toBe(
      "ws://localhost:3000",
    );
    expect(suggestWebSocketUrl("wss://already.ws")).toBeNull();
  });
});

describe("json helpers", () => {
  it("pretty-prints and validates JSON", () => {
    expect(looksLikeJson('{"a":1}')).toBe(true);
    expect(tryPrettyJson('{"a":1}')).toContain("\n");
    expect(validateJson("{bad")).not.toBeNull();
    expect(validateJson('{"ok":true}')).toBeNull();
  });

  it("formats sizes", () => {
    expect(formatWsSize(500)).toBe("500 B");
    expect(formatWsSize(2048)).toBe("2.0 KB");
  });
});

describe("websocketSlice", () => {
  it("tracks session lifecycle and caps the log", () => {
    let state = websocketReducer(undefined, { type: "@@init" });
    state = websocketReducer(
      state,
      wsSessionStarted({ tabId: "t1", sessionId: "ws-1" }),
    );
    expect(state.byTab.t1.status).toBe("connecting");

    state = websocketReducer(
      state,
      wsStatusChanged({ tabId: "t1", status: "open" }),
    );
    expect(state.byTab.t1.status).toBe("open");
    expect(state.byTab.t1.connectedAt).not.toBeNull();

    for (let i = 0; i < WS_LOG_LIMIT + 5; i++) {
      state = websocketReducer(
        state,
        wsMessageLogged({
          tabId: "t1",
          entry: {
            id: `m-${i}`,
            direction: "incoming",
            opcode: "text",
            data: `msg-${i}`,
            encoding: "utf8",
            size: 4,
            timestamp: i,
          },
        }),
      );
    }
    expect(state.byTab.t1.messages.length).toBe(WS_LOG_LIMIT);
    expect(state.byTab.t1.truncated).toBe(true);

    state = websocketReducer(state, wsLogCleared("t1"));
    expect(state.byTab.t1.messages).toHaveLength(0);

    state = websocketReducer(
      state,
      wsErrorSet({ tabId: "t1", message: "boom" }),
    );
    expect(state.byTab.t1.status).toBe("error");
  });
});

describe("WebSocket request draft persistence", () => {
  it("round-trips through FishRequest", () => {
    const draft = createWebSocketRequest("Echo");
    draft.websocket = {
      ...createDefaultWsConfig(),
      messageType: "json",
      protocols: ["chat"],
      messages: [
        { id: "1", name: "Ping", type: "json", body: '{"ping":true}' },
      ],
    };
    expect(isWebSocketRequest(draft)).toBe(true);

    const fish = requestDraftToFish(draft);
    expect(fish.protocol).toBe("websocket");
    expect(fish.websocket?.protocols).toEqual(["chat"]);

    const back = fishRequestToDraft(fish);
    expect(back.protocol).toBe("websocket");
    expect(back.websocket?.messageType).toBe("json");
    expect(back.websocket?.messages[0]?.body).toBe('{"ping":true}');
  });
});
