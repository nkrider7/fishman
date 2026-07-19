import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/store";
import { saveRequestToDb } from "@/store/slices/collectionsSlice";
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";

export const saveActiveTab = createAsyncThunk(
  "tabs/saveActiveTab",
  async (tabId: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const tab = state.tabs.tabs.find((t) => t.id === tabId);
    if (tab?.kind === "runner" || tab?.kind === "collection" || tab?.kind === "git") {
      return null;
    }

    const draft = state.request.drafts[tabId];
    if (!draft) return null;

    // Prefer the request's own collection, then the sidebar selection.
    const collectionId =
      draft.collectionId ?? state.collections.selectedFolderId ?? null;

    const saved = await dispatch(
      saveRequestToDb({ request: draft, collectionId }),
    ).unwrap();

    dispatch(
      updateDraft({
        tabId,
        changes: {
          collectionId: saved.collection_id ?? undefined,
          name: saved.name,
        },
      }),
    );

    dispatch(
      updateTab({
        id: tabId,
        changes: {
          unsaved: false,
          requestId: saved.id,
          title: saved.name || draft.url || "Untitled Request",
        },
      }),
    );

    return saved;
  },
);
