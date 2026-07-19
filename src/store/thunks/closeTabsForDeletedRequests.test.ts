import { describe, expect, it } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import tabsReducer, {
  addTab,
  closeTabsByIds,
} from "@/store/slices/tabsSlice";
import requestReducer, { initDraft } from "@/store/slices/requestSlice";
import responseReducer, { setResponse } from "@/store/slices/responseSlice";
import scriptExecutionReducer from "@/store/slices/scriptExecutionSlice";
import { closeTabsForDeletedRequests } from "@/store/thunks/closeTabsForDeletedRequests";
import { createEmptyRequest } from "@/types/request";

function createTestStore() {
  return configureStore({
    reducer: {
      tabs: tabsReducer,
      request: requestReducer,
      response: responseReducer,
      scriptExecution: scriptExecutionReducer,
    },
  });
}

describe("closeTabsForDeletedRequests", () => {
  it("closes tabs linked to deleted request ids", async () => {
    const store = createTestStore();
    const tabId = "tab-1";
    const requestId = "req-1";

    store.dispatch(addTab({ id: tabId, requestId, title: "Login" }));
    store.dispatch(
      initDraft({
        tabId,
        request: { ...createEmptyRequest("Login"), id: requestId, collectionId: "folder-1" },
      }),
    );
    store.dispatch(
      setResponse({
        tabId,
        response: {
          status: 200,
          status_text: "OK",
          headers: {},
          body: "",
          size_bytes: 0,
          duration_ms: 1,
          timing: {
            total_ms: 1,
            dns_ms: null,
            connect_ms: null,
            ttfb_ms: null,
          },
        },
      }),
    );

    await store.dispatch(
      closeTabsForDeletedRequests({ requestIds: [requestId], folderIds: ["folder-1"] }),
    );

    const state = store.getState();
    expect(state.tabs.tabs.some((t) => t.id === tabId)).toBe(false);
    expect(state.request.drafts[tabId]).toBeUndefined();
    expect(state.response.responses[tabId]).toBeUndefined();
    // Always keeps at least one untitled tab
    expect(state.tabs.tabs.length).toBeGreaterThanOrEqual(1);
  });

  it("closeTabsByIds keeps one untitled tab when all are closed", () => {
    const store = createTestStore();
    const ids = store.getState().tabs.tabs.map((t) => t.id);
    store.dispatch(closeTabsByIds(ids));
    expect(store.getState().tabs.tabs).toHaveLength(1);
    expect(store.getState().tabs.tabs[0].title).toBe("Untitled Request");
  });
});
