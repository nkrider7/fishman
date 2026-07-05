import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import { saveRequestToDb } from "@/store/slices/collectionsSlice";
import { updateTab } from "@/store/slices/tabsSlice";

export const saveActiveTab = createAsyncThunk(
  "tabs/saveActiveTab",
  async (tabId: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const draft = state.request.drafts[tabId];
    if (!draft) return null;

    const collectionId = state.collections.selectedFolderId;
    const saved = await dispatch(
      saveRequestToDb({ request: draft, collectionId }),
    ).unwrap();

    dispatch(
      updateTab({
        id: tabId,
        changes: { unsaved: false, requestId: saved.id },
      }),
    );

    return saved;
  },
);
