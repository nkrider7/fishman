import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { CollectionFolder, SavedRequest } from "@/types/collection";
import * as db from "@/services/dbService";
import {
  importCollectionContent,
  type ImportConflictStrategy,
} from "@/import-export";
import { prepareImportWithStrategy } from "@/import-export/core/conflict";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";

interface CollectionsState {
  folders: CollectionFolder[];
  requests: SavedRequest[];
  selectedFolderId: string | null;
  loading: boolean;
  searchQuery: string;
  treeCollapseKey: number;
}

const initialState: CollectionsState = {
  folders: [],
  requests: [],
  selectedFolderId: null,
  loading: false,
  searchQuery: "",
  treeCollapseKey: 0,
};

export const fetchCollections = createAsyncThunk(
  "collections/fetch",
  async () => {
    const [folders, requests] = await Promise.all([
      db.getCollections(),
      db.getRequests(),
    ]);
    return { folders, requests };
  },
);

export const createFolder = createAsyncThunk(
  "collections/createFolder",
  async ({
    name,
    parentId,
  }: {
    name: string;
    parentId?: string | null;
  }) => {
    return db.createFolder(name, parentId ?? null);
  },
);

export const createCollection = createAsyncThunk(
  "collections/createCollection",
  async (name: string) => {
    return db.createFolder(name, null);
  },
);

export const renameFolder = createAsyncThunk(
  "collections/renameFolder",
  async ({ id, name }: { id: string; name: string }) => {
    await db.renameFolder(id, name);
    return { id, name };
  },
);

export const renameRequest = createAsyncThunk(
  "collections/renameRequest",
  async ({ id, name }: { id: string; name: string }) => {
    await db.renameRequest(id, name);
    return { id, name };
  },
);

export const moveFolder = createAsyncThunk(
  "collections/moveFolder",
  async ({ id, newParentId }: { id: string; newParentId: string | null }) => {
    return db.reorderFolder(id, newParentId, null);
  },
);

export const moveRequest = createAsyncThunk(
  "collections/moveRequest",
  async ({
    id,
    newCollectionId,
  }: {
    id: string;
    newCollectionId: string | null;
  }) => {
    return db.reorderRequest(id, newCollectionId, null);
  },
);

export const reorderFolder = createAsyncThunk(
  "collections/reorderFolder",
  async ({
    id,
    parentId,
    beforeId,
  }: {
    id: string;
    parentId: string | null;
    beforeId: string | null;
  }) => {
    return db.reorderFolder(id, parentId, beforeId);
  },
);

export const reorderRequest = createAsyncThunk(
  "collections/reorderRequest",
  async ({
    id,
    collectionId,
    beforeId,
  }: {
    id: string;
    collectionId: string | null;
    beforeId: string | null;
  }) => {
    return db.reorderRequest(id, collectionId, beforeId);
  },
);

export const deleteFolder = createAsyncThunk(
  "collections/deleteFolder",
  async (id: string) => {
    const descendants = await db.getCollections();
    const toDelete = new Set<string>([id]);
    const collect = (parentId: string) => {
      for (const f of descendants) {
        if (f.parent_id === parentId) {
          toDelete.add(f.id);
          collect(f.id);
        }
      }
    };
    collect(id);
    await db.deleteFolder(id);
    return Array.from(toDelete);
  },
);

export const saveRequestToDb = createAsyncThunk(
  "collections/saveRequest",
  async ({
    request,
    collectionId,
  }: {
    request: Parameters<typeof db.saveRequest>[0];
    collectionId?: string | null;
  }) => {
    return db.saveRequest(request, collectionId);
  },
);

export const deleteRequestFromDb = createAsyncThunk(
  "collections/deleteRequest",
  async (id: string) => {
    await db.deleteRequest(id);
    return id;
  },
);

export const duplicateRequestInDb = createAsyncThunk(
  "collections/duplicateRequest",
  async (id: string) => db.duplicateRequest(id),
);

export const openImportDialog = createAsyncThunk(
  "collections/openImportDialog",
  async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Collections", extensions: ["json", "fishman.json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (!selected || typeof selected !== "string") return null;
    const content = await readTextFile(selected);
    const filename = selected.split(/[/\\]/).pop();
    return { content, filename };
  },
);

export const confirmCollectionImport = createAsyncThunk(
  "collections/confirmImport",
  async ({
    content,
    filename,
    formatId,
    strategy = "duplicate",
  }: {
    content: string;
    filename?: string;
    formatId?: string;
    strategy?: ImportConflictStrategy;
  }) => {
    const folders = await db.getCollections();
    const { result } = importCollectionContent(content, filename, formatId);
    const prepared = prepareImportWithStrategy(result, folders, strategy);
    if (!prepared) return null;
    return db.importCollection(prepared.data, prepared.options);
  },
);

/** @deprecated Use ImportDialog via openImportDialog */
export const openCollectionFromFile = openImportDialog;

/** @deprecated Use ImportDialog via openImportDialog */
export const importCollectionFromFile = openImportDialog;

const collectionsSlice = createSlice({
  name: "collections",
  initialState,
  reducers: {
    setSelectedFolder: (state, action) => {
      state.selectedFolderId = action.payload;
    },
    setSearchQuery: (state, action) => {
      state.searchQuery = action.payload;
    },
    collapseAllTreeFolders: (state) => {
      state.treeCollapseKey += 1;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCollections.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchCollections.fulfilled, (state, action) => {
        state.folders = action.payload.folders;
        state.requests = action.payload.requests;
        state.loading = false;
      })
      .addCase(createFolder.fulfilled, (state, action) => {
        state.folders.push(action.payload);
      })
      .addCase(createCollection.fulfilled, (state, action) => {
        state.folders.push(action.payload);
        state.selectedFolderId = action.payload.id;
      })
      .addCase(renameFolder.fulfilled, (state, action) => {
        const folder = state.folders.find((f) => f.id === action.payload.id);
        if (folder) folder.name = action.payload.name;
      })
      .addCase(renameRequest.fulfilled, (state, action) => {
        const request = state.requests.find((r) => r.id === action.payload.id);
        if (request) request.name = action.payload.name;
      })
      .addCase(moveFolder.fulfilled, (state, action) => {
        for (const update of action.payload) {
          const folder = state.folders.find((f) => f.id === update.id);
          if (folder) {
            folder.parent_id = update.parent_id;
            folder.sort_order = update.sort_order;
          }
        }
      })
      .addCase(moveRequest.fulfilled, (state, action) => {
        for (const update of action.payload) {
          const request = state.requests.find((r) => r.id === update.id);
          if (request) {
            request.collection_id = update.collection_id;
            request.sort_order = update.sort_order;
          }
        }
      })
      .addCase(reorderFolder.fulfilled, (state, action) => {
        for (const update of action.payload) {
          const folder = state.folders.find((f) => f.id === update.id);
          if (folder) {
            folder.parent_id = update.parent_id;
            folder.sort_order = update.sort_order;
          }
        }
      })
      .addCase(reorderRequest.fulfilled, (state, action) => {
        for (const update of action.payload) {
          const request = state.requests.find((r) => r.id === update.id);
          if (request) {
            request.collection_id = update.collection_id;
            request.sort_order = update.sort_order;
          }
        }
      })
      .addCase(deleteFolder.fulfilled, (state, action) => {
        const deletedIds = new Set(action.payload);
        state.folders = state.folders.filter((f) => !deletedIds.has(f.id));
        state.requests = state.requests.filter(
          (r) => !r.collection_id || !deletedIds.has(r.collection_id),
        );
        if (state.selectedFolderId && deletedIds.has(state.selectedFolderId)) {
          state.selectedFolderId = null;
        }
      })
      .addCase(saveRequestToDb.fulfilled, (state, action) => {
        const idx = state.requests.findIndex((r) => r.id === action.payload.id);
        if (idx >= 0) state.requests[idx] = action.payload;
        else state.requests.push(action.payload);
      })
      .addCase(deleteRequestFromDb.fulfilled, (state, action) => {
        state.requests = state.requests.filter((r) => r.id !== action.payload);
      })
      .addCase(duplicateRequestInDb.fulfilled, (state, action) => {
        state.requests.push(action.payload);
      })
      .addCase(confirmCollectionImport.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.folders.push(...action.payload.folders);
        state.requests.push(...action.payload.requests);
        state.selectedFolderId =
          action.payload.folders[0]?.id ?? state.selectedFolderId;
      });
  },
});

export const { setSelectedFolder, setSearchQuery, collapseAllTreeFolders } =
  collectionsSlice.actions;
export default collectionsSlice.reducer;
