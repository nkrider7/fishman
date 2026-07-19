import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { parseFolderSettings, type FolderSettings } from "@/types/collection";
import * as db from "@/services/dbService";
import { addTab, setActiveTab, updateTab } from "../slices/tabsSlice";
import {
  openSettingsDraft,
  markSettingsSaved,
  closeSettingsDraft,
} from "../slices/collectionSettingsSlice";
import { generateId } from "@/utils/id";

/**
 * Open collection/folder settings in a dedicated main tab.
 * Reuses a single `kind: "collection"` tab (runner-style). If the current
 * draft is dirty for a different folder, focuses that tab instead of discarding.
 */
export const openCollectionSettings = createAsyncThunk(
  "collectionSettings/open",
  async (folderId: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const folder = state.collections.folders.find((f) => f.id === folderId);
    if (!folder) throw new Error("Folder not found");

    const current = state.collectionSettings.draft;
    if (
      current?.dirty &&
      current.folderId !== folderId &&
      current.tabId
    ) {
      dispatch(setActiveTab(current.tabId));
      return {
        tabId: current.tabId,
        folderId: current.folderId,
        blocked: true as const,
      };
    }

    const settings = parseFolderSettings(folder);
    const existing = state.tabs.tabs.find((t) => t.kind === "collection");
    const tabId = existing?.id ?? generateId();

    if (!existing) {
      dispatch(
        addTab({
          id: tabId,
          title: folder.name,
          kind: "collection",
          collectionFolderId: folderId,
        }),
      );
    } else {
      dispatch(
        updateTab({
          id: tabId,
          changes: {
            title: folder.name,
            collectionFolderId: folderId,
            unsaved: current?.folderId === folderId ? current.dirty : false,
          },
        }),
      );
      dispatch(setActiveTab(tabId));
    }

    dispatch(
      openSettingsDraft({
        folderId,
        name: folder.name,
        settings:
          current?.folderId === folderId && current.dirty
            ? current.settings
            : settings,
        tabId,
        dirty: current?.folderId === folderId ? current.dirty : false,
      }),
    );

    return { tabId, folderId, blocked: false as const };
  },
);

export const saveFolderSettings = createAsyncThunk(
  "collectionSettings/save",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const draft = state.collectionSettings.draft;
    if (!draft) throw new Error("No settings draft");

    const saved = await db.updateFolderSettings(
      draft.folderId,
      draft.settings,
    );

    const { fetchCollections } = await import("../slices/collectionsSlice");
    await dispatch(fetchCollections());

    const settings = parseFolderSettings(saved);
    dispatch(markSettingsSaved({ settings, name: saved.name }));

    if (draft.tabId) {
      dispatch(
        updateTab({
          id: draft.tabId,
          changes: { unsaved: false, title: saved.name },
        }),
      );
    }

    return saved;
  },
);

export const saveFolderSettingsPayload = createAsyncThunk(
  "collectionSettings/savePayload",
  async (
    payload: { folderId: string; settings: FolderSettings },
    { dispatch },
  ) => {
    const saved = await db.updateFolderSettings(
      payload.folderId,
      payload.settings,
    );
    const { fetchCollections } = await import("../slices/collectionsSlice");
    await dispatch(fetchCollections());
    return saved;
  },
);

export { closeSettingsDraft };
