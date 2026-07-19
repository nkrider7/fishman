import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CollectionFolder, SavedRequest } from "@/types/collection";
import * as db from "@/services/dbService";
import {
  importCollectionContent,
  type ImportConflictStrategy,
} from "@/import-export";
import { prepareImportWithStrategy } from "@/import-export/core/conflict";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";

export type CollectionsSourceMode = "sqlite" | "filesystem";

interface CollectionsState {
  folders: CollectionFolder[];
  requests: SavedRequest[];
  selectedFolderId: string | null;
  loading: boolean;
  searchQuery: string;
  treeCollapseKey: number;
  /** sqlite = personal DB; filesystem = open git-native project. */
  sourceMode: CollectionsSourceMode;
  filesystemRootPath: string | null;
  filesystemProjectName: string | null;
}

const initialState: CollectionsState = {
  folders: [],
  requests: [],
  selectedFolderId: null,
  loading: false,
  searchQuery: "",
  treeCollapseKey: 0,
  sourceMode: "sqlite",
  filesystemRootPath: null,
  filesystemProjectName: null,
};

export const fetchCollections = createAsyncThunk(
  "collections/fetch",
  async (_arg, { getState }) => {
    const state = getState() as import("../index").RootState;
    // Don't clobber an open filesystem project with sqlite rows.
    if (state.collections.sourceMode === "filesystem") {
      return {
        folders: state.collections.folders,
        requests: state.collections.requests,
        skipped: true as const,
      };
    }
    const workspaceId = state.workspaces.activeWorkspaceId;
    const [folders, requests] = await Promise.all([
      db.getCollections(workspaceId),
      db.getRequests(workspaceId),
    ]);
    return { folders, requests, skipped: false as const };
  },
);

export const createFolder = createAsyncThunk(
  "collections/createFolder",
  async (
    {
      name,
      parentId,
    }: {
      name: string;
      parentId?: string | null;
    },
    { getState, dispatch },
  ) => {
    const state = getState() as import("../index").RootState;
    if (
      state.collections.sourceMode === "filesystem" &&
      state.collections.filesystemRootPath
    ) {
      const { createFolderOnDisk } = await import("@/git-native");
      const folder = await createFolderOnDisk({
        name,
        parentId: parentId ?? null,
        folders: state.collections.folders,
        workspaceRootPath: state.collections.filesystemRootPath,
        workspaceId: `fs:${state.git.workspaceName ?? "project"}`,
      });
      const gitThunks = await import("../thunks/gitThunks");
      void dispatch(gitThunks.refreshGitStatus());
      void dispatch(gitThunks.refreshFilesystemCollections());
      return folder;
    }
    return db.createFolder(
      name,
      parentId ?? null,
      state.workspaces.activeWorkspaceId,
    );
  },
);

export const createCollection = createAsyncThunk(
  "collections/createCollection",
  async (name: string, { getState, dispatch }) => {
    const state = getState() as import("../index").RootState;
    if (
      state.collections.sourceMode === "filesystem" &&
      state.collections.filesystemRootPath
    ) {
      const rootId =
        state.collections.folders.find((f) => !f.parent_id)?.id ?? null;
      const { createFolderOnDisk } = await import("@/git-native");
      const folder = await createFolderOnDisk({
        name,
        parentId: rootId,
        folders: state.collections.folders,
        workspaceRootPath: state.collections.filesystemRootPath,
        workspaceId: `fs:${state.git.workspaceName ?? "project"}`,
      });
      void dispatch(
        (await import("../thunks/gitThunks")).refreshGitStatus(),
      );
      void dispatch(
        (await import("../thunks/gitThunks")).refreshFilesystemCollections(),
      );
      return folder;
    }
    return db.createFolder(name, null, state.workspaces.activeWorkspaceId);
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
  async ({ id, name }: { id: string; name: string }, { getState, dispatch }) => {
    const trimmed = name.trim();
    const state = getState() as import("../index").RootState;

    if (
      state.collections.sourceMode === "filesystem" &&
      state.collections.filesystemRootPath
    ) {
      const existing = state.collections.requests.find((r) => r.id === id);
      if (!existing) {
        throw new Error("Request not found");
      }
      const { saveRequestOnDisk } = await import("@/git-native");
      await saveRequestOnDisk({
        request: { ...db.rowToRequest(existing), name: trimmed },
        collectionId: existing.collection_id,
        folders: state.collections.folders,
        workspaceRootPath: state.collections.filesystemRootPath,
      });
      void dispatch(
        (await import("../thunks/gitThunks")).refreshGitStatus(),
      );
    } else {
      await db.renameRequest(id, trimmed);
    }

    // Keep open tab titles + editor drafts aligned with the sidebar name.
    const { updateTab } = await import("./tabsSlice");
    const { updateDraft } = await import("./requestSlice");
    for (const tab of state.tabs.tabs) {
      if (tab.requestId !== id) continue;
      if (tab.kind && tab.kind !== "request") continue;
      dispatch(updateTab({ id: tab.id, changes: { title: trimmed } }));
      dispatch(updateDraft({ tabId: tab.id, changes: { name: trimmed } }));
    }

    return { id, name: trimmed };
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
  async (id: string, { getState, dispatch }) => {
    const state = getState() as import("../index").RootState;
    const descendants = state.collections.folders;
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

    const requestIds = state.collections.requests
      .filter((r) => r.collection_id && toDelete.has(r.collection_id))
      .map((r) => r.id);

    await db.deleteFolder(id);

    const { closeTabsForDeletedRequests } = await import(
      "../thunks/closeTabsForDeletedRequests"
    );
    await dispatch(
      closeTabsForDeletedRequests({
        requestIds,
        folderIds: Array.from(toDelete),
      }),
    );

    return { folderIds: Array.from(toDelete), requestIds };
  },
);

export const saveRequestToDb = createAsyncThunk(
  "collections/saveRequest",
  async (
    {
      request,
      collectionId,
    }: {
      request: Parameters<typeof db.saveRequest>[0];
      collectionId?: string | null;
    },
    { getState, dispatch },
  ) => {
    const state = getState() as import("../index").RootState;
    if (
      state.collections.sourceMode === "filesystem" &&
      state.collections.filesystemRootPath
    ) {
      const { saveRequestOnDisk } = await import("@/git-native");
      const saved = await saveRequestOnDisk({
        request,
        collectionId: collectionId ?? request.collectionId ?? null,
        folders: state.collections.folders,
        workspaceRootPath: state.collections.filesystemRootPath,
      });
      // Refresh Git Changes only — avoid full tree reparse (collapse / flicker).
      void dispatch(
        (await import("../thunks/gitThunks")).refreshGitStatus(),
      );
      return saved;
    }
    return db.saveRequest(request, collectionId);
  },
);

export const deleteRequestFromDb = createAsyncThunk(
  "collections/deleteRequest",
  async (id: string, { dispatch }) => {
    await db.deleteRequest(id);
    const { closeTabsForDeletedRequests } = await import(
      "../thunks/closeTabsForDeletedRequests"
    );
    await dispatch(closeTabsForDeletedRequests({ requestIds: [id] }));
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
  async (
    {
      content,
      filename,
      formatId,
      strategy = "duplicate",
    }: {
      content: string;
      filename?: string;
      formatId?: string;
      strategy?: ImportConflictStrategy;
    },
    { getState },
  ) => {
    const state = getState() as import("../index").RootState;
    const workspaceId = state.workspaces.activeWorkspaceId;
    const folders = await db.getCollections(workspaceId);
    const { result } = importCollectionContent(content, filename, formatId);
    const prepared = prepareImportWithStrategy(result, folders, strategy);
    if (!prepared) return null;
    return db.importCollection(prepared.data, {
      ...prepared.options,
      workspaceId,
    });
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
    setFilesystemCollections: (
      state,
      action: PayloadAction<{
        folders: CollectionFolder[];
        requests: SavedRequest[];
        rootFolderId: string;
        rootPath: string;
        projectName: string;
      }>,
    ) => {
      const rootChanged =
        state.filesystemRootPath !== action.payload.rootPath ||
        state.sourceMode !== "filesystem";

      state.sourceMode = "filesystem";
      state.folders = action.payload.folders;
      state.requests = action.payload.requests;
      state.filesystemRootPath = action.payload.rootPath;
      state.filesystemProjectName = action.payload.projectName;
      state.loading = false;

      // Keep sidebar selection unless it vanished (don't yank users to root).
      const stillValid =
        state.selectedFolderId != null &&
        action.payload.folders.some((f) => f.id === state.selectedFolderId);
      if (!stillValid) {
        state.selectedFolderId = action.payload.rootFolderId;
      }

      // Only collapse when opening a different project — refreshing after
      // save/create must not wipe expanded folder state.
      if (rootChanged) {
        state.treeCollapseKey += 1;
      }
    },
    clearFilesystemCollections: (state) => {
      state.sourceMode = "sqlite";
      state.filesystemRootPath = null;
      state.filesystemProjectName = null;
      state.folders = [];
      state.requests = [];
      state.selectedFolderId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCollections.pending, (state) => {
        if (state.sourceMode !== "filesystem") {
          state.loading = true;
        }
      })
      .addCase(fetchCollections.fulfilled, (state, action) => {
        if (action.payload.skipped) {
          state.loading = false;
          return;
        }
        // Ignore stale sqlite responses that arrive after a git project rebind.
        if (state.sourceMode === "filesystem") {
          state.loading = false;
          return;
        }
        state.folders = action.payload.folders;
        state.requests = action.payload.requests;
        state.loading = false;
        state.sourceMode = "sqlite";
        state.filesystemRootPath = null;
        state.filesystemProjectName = null;
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
        const deletedIds = new Set(action.payload.folderIds);
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

export const {
  setSelectedFolder,
  setSearchQuery,
  collapseAllTreeFolders,
  setFilesystemCollections,
  clearFilesystemCollections,
} = collectionsSlice.actions;
export default collectionsSlice.reducer;
