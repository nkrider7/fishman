import { createAsyncThunk } from "@reduxjs/toolkit";
import { rowToRequest } from "@/services/dbService";
import type { SavedRequest } from "@/types/collection";
import { createEmptyRequest, type RequestDraft } from "@/types/request";
import type { RootState } from "../index";
import { addTab, setActiveTab } from "../slices/tabsSlice";
import { initDraft } from "../slices/requestSlice";
import { generateId } from "@/utils/id";

export const openRequestTab = createAsyncThunk(
  "tabs/openRequest",
  async (
    payload: {
      request?: RequestDraft;
      savedRequest?: SavedRequest;
      title?: string;
      forceNew?: boolean;
    },
    { dispatch, getState },
  ) => {
    const state = getState() as RootState;
    const savedId = payload.savedRequest?.id ?? payload.request?.id;

    if (savedId && !payload.forceNew) {
      const existingByRequestId = state.tabs.tabs.find(
        (t) => t.requestId === savedId,
      );
      if (existingByRequestId) {
        dispatch(setActiveTab(existingByRequestId.id));
        return existingByRequestId.id;
      }

      const existingByDraftId = state.tabs.tabs.find(
        (t) => state.request.drafts[t.id]?.id === savedId,
      );
      if (existingByDraftId) {
        dispatch(setActiveTab(existingByDraftId.id));
        return existingByDraftId.id;
      }
    }

    const draft =
      payload.request ??
      (payload.savedRequest
        ? rowToRequest(payload.savedRequest)
        : createEmptyRequest(payload.title));

    const tabId = generateId();
    dispatch(
      addTab({
        id: tabId,
        title: draft.name,
        requestId: payload.savedRequest?.id ?? draft.id,
      }),
    );
    dispatch(initDraft({ tabId, request: draft }));
    return tabId;
  },
);
