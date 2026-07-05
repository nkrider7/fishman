import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RequestDraft } from "@/types/request";
import { createEmptyRequest } from "@/types/request";
import { initialRequestTabId } from "./tabsSlice";

interface RequestState {
  drafts: Record<string, RequestDraft>;
}

const initialState: RequestState = {
  drafts: {
    [initialRequestTabId]: createEmptyRequest(),
  },
};

const requestSlice = createSlice({
  name: "request",
  initialState,
  reducers: {
    initDraft: (
      state,
      action: PayloadAction<{ tabId: string; request?: RequestDraft }>,
    ) => {
      state.drafts[action.payload.tabId] =
        action.payload.request ?? createEmptyRequest();
    },
    updateDraft: (
      state,
      action: PayloadAction<{ tabId: string; changes: Partial<RequestDraft> }>,
    ) => {
      const draft = state.drafts[action.payload.tabId];
      if (draft) {
        Object.assign(draft, action.payload.changes);
      }
    },
    setDraft: (
      state,
      action: PayloadAction<{ tabId: string; request: RequestDraft }>,
    ) => {
      state.drafts[action.payload.tabId] = action.payload.request;
    },
    removeDraft: (state, action: PayloadAction<string>) => {
      delete state.drafts[action.payload];
    },
  },
});

export const { initDraft, updateDraft, setDraft, removeDraft } =
  requestSlice.actions;
export default requestSlice.reducer;
