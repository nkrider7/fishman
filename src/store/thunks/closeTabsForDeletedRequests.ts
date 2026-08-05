import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { closeTabsByIds } from "../slices/tabsSlice";
import { initDraft, removeDraft } from "../slices/requestSlice";
import { clearResponse } from "../slices/responseSlice";
import { clearScriptExecution } from "../slices/scriptExecutionSlice";
import { createEmptyRequest } from "@/types/request";
import { cleanupWebSocketTabThunk } from "./websocketThunks";

/**
 * Close open tabs that belong to deleted collection requests,
 * and clean up their drafts / responses / script / websocket state.
 */
export const closeTabsForDeletedRequests = createAsyncThunk(
  "tabs/closeForDeletedRequests",
  async (
    payload: {
      requestIds: string[];
      folderIds?: string[];
    },
    { getState, dispatch },
  ) => {
    const requestIds = new Set(payload.requestIds.filter(Boolean));
    const folderIds = new Set(payload.folderIds?.filter(Boolean) ?? []);
    if (requestIds.size === 0 && folderIds.size === 0) return [];

    const state = getState() as RootState;
    const beforeTabIds = new Set(state.tabs.tabs.map((t) => t.id));

    const tabIdsToClose = state.tabs.tabs
      .filter((tab) => {
        if (tab.requestId && requestIds.has(tab.requestId)) return true;
        const draft = state.request.drafts[tab.id];
        if (!draft) return false;
        if (draft.id && requestIds.has(draft.id)) return true;
        if (draft.collectionId && folderIds.has(draft.collectionId)) return true;
        return false;
      })
      .map((tab) => tab.id);

    if (tabIdsToClose.length === 0) return [];

    for (const tabId of tabIdsToClose) {
      await dispatch(cleanupWebSocketTabThunk(tabId));
    }

    dispatch(closeTabsByIds(tabIdsToClose));

    for (const tabId of tabIdsToClose) {
      dispatch(removeDraft(tabId));
      dispatch(clearResponse(tabId));
      dispatch(clearScriptExecution(tabId));
    }

    // If closeTabsByIds created a fresh Untitled tab, give it an empty draft
    const after = getState() as RootState;
    for (const tab of after.tabs.tabs) {
      if (!beforeTabIds.has(tab.id) && !after.request.drafts[tab.id]) {
        dispatch(initDraft({ tabId: tab.id, request: createEmptyRequest() }));
      }
    }

    return tabIdsToClose;
  },
);
