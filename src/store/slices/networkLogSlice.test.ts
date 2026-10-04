import { describe, expect, it } from "vitest";
import networkLogReducer, {
  appendNetworkLog,
  clearNetworkLog,
  selectNetworkLogEntry,
  type NetworkLogEntry,
} from "./networkLogSlice";

const sampleEntry = (id: string): NetworkLogEntry => ({
  id,
  method: "GET",
  statusCode: 200,
  url: "https://example.com/",
  domain: "example.com",
  path: "/",
  startedAt: Date.now(),
  durationMs: 10,
  sizeBytes: 100,
});

describe("networkLogSlice", () => {
  it("appends and selects entries", () => {
    let state = networkLogReducer(undefined, { type: "init" });
    state = networkLogReducer(state, appendNetworkLog(sampleEntry("a")));
    state = networkLogReducer(state, selectNetworkLogEntry("a"));
    expect(state.entries).toHaveLength(1);
    expect(state.selectedId).toBe("a");
  });

  it("clears entries and selection", () => {
    let state = networkLogReducer(undefined, appendNetworkLog(sampleEntry("a")));
    state = networkLogReducer(state, selectNetworkLogEntry("a"));
    state = networkLogReducer(state, clearNetworkLog());
    expect(state.entries).toHaveLength(0);
    expect(state.selectedId).toBeNull();
  });
});
