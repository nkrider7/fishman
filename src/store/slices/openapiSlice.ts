import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import {
  buildDriftReport,
  buildSyncPlan,
  collectRequestsUnderRoot,
  selectSafeSyncIds,
  endpointToSyncedDraftWithBase,
  type DriftReport,
  type SyncOptions,
} from "@/scan-drift";
import { buildScanMetaFromEndpoint } from "@/scan-drift/identity";
import * as db from "@/services/dbService";
import { fetchCollections } from "./collectionsSlice";
import {
  fetchOpenApiFromUrl,
  getSpecLink,
  listSpecLinks,
  parseSpecDocument,
  pickOpenApiFile,
  prepareConnectFromContent,
  upsertSpecLink,
  fingerprintSpecEndpoints,
  type SpecLink,
  type SpecSource,
} from "@/openapi";

export type OpenApiFilter = "all" | "added" | "removed" | "changed";

interface OpenApiState {
  connectOpen: boolean;
  syncOpen: boolean;
  collectionRootId: string | null;
  link: SpecLink | null;
  links: SpecLink[];
  report: DriftReport | null;
  selectedItemIds: string[];
  filter: OpenApiFilter;
  connecting: boolean;
  checking: boolean;
  syncing: boolean;
  error: string | null;
  sourceMode: SpecSource;
  urlInput: string;
  filePath: string | null;
  fileName: string | null;
  fileContent: string | null;
}

const initialState: OpenApiState = {
  connectOpen: false,
  syncOpen: false,
  collectionRootId: null,
  link: null,
  links: [],
  report: null,
  selectedItemIds: [],
  filter: "all",
  connecting: false,
  checking: false,
  syncing: false,
  error: null,
  sourceMode: "url",
  urlInput: "",
  filePath: null,
  fileName: null,
  fileContent: null,
};

export const loadSpecLinks = createAsyncThunk("openapi/loadLinks", async () =>
  listSpecLinks(),
);

export const openConnectOpenApi = createAsyncThunk(
  "openapi/openConnect",
  async (collectionRootId: string | undefined, { dispatch }) => {
    void dispatch(loadSpecLinks());
    return { collectionRootId: collectionRootId ?? null };
  },
);

export const pickOpenApiSpecFile = createAsyncThunk(
  "openapi/pickFile",
  async () => pickOpenApiFile(),
);

export const connectOpenApiSpec = createAsyncThunk(
  "openapi/connect",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const oa = state.openapi;
    const ignoreSsl = state.settings.ignoreSsl;
    const timeoutMs = state.settings.timeoutMs;
    const workspaceId = state.workspaces.activeWorkspaceId;

    let content = oa.fileContent;
    let filename = oa.fileName ?? undefined;
    let source: SpecSource = oa.sourceMode;
    let resolvedPath = oa.filePath ?? undefined;
    let resolvedUrl =
      oa.sourceMode === "url" ? oa.urlInput.trim() : undefined;

    if (oa.sourceMode === "url") {
      const fetched = await fetchOpenApiFromUrl(oa.urlInput, {
        ignoreSsl,
        timeoutMs,
      });
      content = fetched.content;
      filename = fetched.filename;
      source = "url";
      resolvedUrl = fetched.specUrl ?? oa.urlInput.trim();
    } else if (!content) {
      throw new Error("Select an OpenAPI/Swagger file first.");
    }

    if (!content) throw new Error("No OpenAPI content to import.");

    const prepared = prepareConnectFromContent({
      content,
      filename,
      source,
      filePath: resolvedPath,
      specUrl: resolvedUrl,
    });

    if (prepared.endpointCount === 0) {
      throw new Error("No HTTP operations found in the specification.");
    }

    const existingRootId = oa.collectionRootId;
    let rootId = existingRootId;

    if (!rootId) {
      const imported = await db.importCollection(prepared.importResult, {
        workspaceId,
      });
      rootId =
        imported.folders.find((f) => !f.parent_id)?.id ??
        prepared.importResult.rootFolder.id;
    }

    const link = await upsertSpecLink({
      collectionRootId: rootId,
      ...prepared.linkDraft,
      lastSyncAt: Date.now(),
    });

    await dispatch(fetchCollections());

    return {
      link,
      createdNew: !existingRootId,
      warnings: prepared.warnings,
      endpointCount: prepared.endpointCount,
    };
  },
);

async function loadSpecContentForLink(
  link: SpecLink,
  options: { ignoreSsl: boolean; timeoutMs: number },
): Promise<{ content: string; filename?: string }> {
  if (link.source === "url" && link.specUrl) {
    const fetched = await fetchOpenApiFromUrl(link.specUrl, options);
    return { content: fetched.content, filename: fetched.filename };
  }
  if (link.filePath) {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const content = await readTextFile(link.filePath);
    return {
      content,
      filename: link.filePath.split(/[/\\]/).pop(),
    };
  }
  throw new Error(
    "Spec link is missing a file path or URL. Reconnect the spec.",
  );
}

export const openOpenApiSync = createAsyncThunk(
  "openapi/openSync",
  async (collectionRootId: string | undefined, { getState, dispatch }) => {
    const state = getState() as RootState;
    const rootId =
      collectionRootId ??
      state.openapi.collectionRootId ??
      state.collections.selectedFolderId;
    if (!rootId) {
      throw new Error("Select a collection to sync with OpenAPI.");
    }
    const link = await getSpecLink(rootId);
    if (!link) {
      throw new Error(
        "No OpenAPI Spec Link for this collection. Use Connect to OpenAPI Spec first.",
      );
    }
    void dispatch(loadSpecLinks());
    return { collectionRootId: rootId, link };
  },
);

export const checkOpenApiDrift = createAsyncThunk(
  "openapi/checkDrift",
  async (
    payload: { collectionRootId?: string } | undefined,
    { getState, dispatch },
  ) => {
    const state = getState() as RootState;
    const rootId =
      payload?.collectionRootId ?? state.openapi.collectionRootId ?? undefined;
    if (!rootId) {
      throw new Error("No collection selected for OpenAPI sync.");
    }

    let link = await getSpecLink(rootId);
    if (!link) {
      throw new Error(
        "No OpenAPI Spec Link for this collection. Connect a spec first.",
      );
    }

    const started = Date.now();
    const { content, filename } = await loadSpecContentForLink(link, {
      ignoreSsl: state.settings.ignoreSsl,
      timeoutMs: state.settings.timeoutMs,
    });
    const parsed = parseSpecDocument(content, filename);

    await dispatch(fetchCollections());
    const nextState = getState() as RootState;
    const requests = collectRequestsUnderRoot(
      rootId,
      nextState.collections.folders,
      nextState.collections.requests,
    );

    const report = buildDriftReport({
      collectionRootId: rootId,
      projectLabel: link.specUrl || link.filePath || link.title || "OpenAPI",
      requests,
      endpoints: parsed.endpoints,
      warnings: parsed.warnings,
      scanResultMeta: {
        language: "openapi",
        frameworks: [parsed.document.format],
        durationMs: Date.now() - started,
      },
    });

    link = await upsertSpecLink({
      ...link,
      lastSyncAt: Date.now(),
      lastSpecFingerprint: fingerprintSpecEndpoints(parsed.endpoints),
      baseUrl: parsed.document.baseUrl ?? link.baseUrl,
      specVersion: `${parsed.document.format} ${parsed.document.version}`,
      title: parsed.document.title,
    });

    const selectedItemIds = report.items
      .filter(
        (i) =>
          i.kind === "added" ||
          i.kind === "removed" ||
          (i.kind === "changed" && !i.locked),
      )
      .map((i) => i.id);

    return { report, link, selectedItemIds };
  },
);

export const applyOpenApiSync = createAsyncThunk(
  "openapi/applySync",
  async (
    payload: {
      itemIds?: string[];
      options?: SyncOptions;
      mode?: "selected" | "safe";
    },
    { getState, dispatch },
  ) => {
    const state = getState() as RootState;
    const report = state.openapi.report;
    const link = state.openapi.link;
    if (!report || !link) {
      throw new Error("Run Check for updates before syncing.");
    }

    const itemIds =
      payload.mode === "safe"
        ? selectSafeSyncIds(report)
        : (payload.itemIds ?? state.openapi.selectedItemIds);

    if (itemIds.length === 0) {
      throw new Error("Select at least one item to sync.");
    }

    const plan = buildSyncPlan(report, itemIds, {
      ...payload.options,
      archiveFolderName:
        payload.options?.archiveFolderName ?? "_Removed by OpenAPI",
    });
    const workspaceId = state.workspaces.activeWorkspaceId;
    const isFilesystem = state.collections.sourceMode === "filesystem";

    let archiveFolderId: string | null = null;
    if (plan.actions.some((a) => a.kind === "archive")) {
      if (isFilesystem) {
        const { createFolder } = await import("./collectionsSlice");
        const folder = await dispatch(
          createFolder({
            name: plan.archiveFolderName,
            parentId: report.collectionRootId,
          }),
        ).unwrap();
        archiveFolderId = folder.id;
      } else {
        const existing = state.collections.folders.find(
          (f) =>
            f.parent_id === report.collectionRootId &&
            f.name === plan.archiveFolderName,
        );
        if (existing) {
          archiveFolderId = existing.id;
        } else {
          const folder = await db.createFolder(
            plan.archiveFolderName,
            report.collectionRootId,
            workspaceId,
          );
          archiveFolderId = folder.id;
        }
      }
    }

    const folderCache = new Map<string, string>();
    const ensureFolderPath = async (segments: string[]): Promise<string> => {
      let parentId = report.collectionRootId;
      let key = "";
      for (const segment of segments) {
        key = key ? `${key}/${segment}` : segment;
        const cached = folderCache.get(key);
        if (cached) {
          parentId = cached;
          continue;
        }
        const latest = (getState() as RootState).collections.folders;
        const found = latest.find(
          (f) => f.parent_id === parentId && f.name === segment,
        );
        if (found) {
          folderCache.set(key, found.id);
          parentId = found.id;
          continue;
        }
        if (isFilesystem) {
          const { createFolder } = await import("./collectionsSlice");
          const folder = await dispatch(
            createFolder({ name: segment, parentId }),
          ).unwrap();
          folderCache.set(key, folder.id);
          parentId = folder.id;
        } else {
          const folder = await db.createFolder(segment, parentId, workspaceId);
          folderCache.set(key, folder.id);
          parentId = folder.id;
        }
      }
      return parentId;
    };

    for (const action of plan.actions) {
      if (action.kind === "skip") continue;

      if (action.kind === "create" && action.endpoint) {
        const draft = {
          ...endpointToSyncedDraftWithBase(action.endpoint, "{{baseUrl}}"),
          scan: buildScanMetaFromEndpoint(action.endpoint, "openapi"),
        };
        const folderId = await ensureFolderPath(
          action.folderPath ?? ["Default"],
        );
        if (isFilesystem) {
          const { saveRequestToDb } = await import("./collectionsSlice");
          await dispatch(
            saveRequestToDb({ request: draft, collectionId: folderId }),
          ).unwrap();
        } else {
          await db.saveRequest(draft, folderId);
        }
      }

      if (action.kind === "update" && action.draft && action.requestId) {
        const draft = {
          ...action.draft,
          id: action.requestId,
          scan: {
            ...buildScanMetaFromEndpoint(
              action.endpoint ?? ({} as never),
              "openapi",
            ),
            ...action.draft.scan,
            origin: "openapi" as const,
            scanKey: action.draft.scan?.scanKey ?? action.scanKey,
            userLocked: action.draft.scan?.userLocked,
          },
        };
        if (action.endpoint) {
          draft.scan = {
            ...buildScanMetaFromEndpoint(action.endpoint, "openapi"),
            origin: "openapi" as const,
            userLocked: action.draft.scan?.userLocked,
          };
        }
        if (isFilesystem) {
          const { saveRequestToDb } = await import("./collectionsSlice");
          await dispatch(
            saveRequestToDb({
              request: draft,
              collectionId: draft.collectionId ?? null,
            }),
          ).unwrap();
        } else {
          await db.saveRequest(draft, draft.collectionId);
        }
      }

      if (action.kind === "archive" && action.requestId && archiveFolderId) {
        const existing = (getState() as RootState).collections.requests.find(
          (r) => r.id === action.requestId,
        );
        if (isFilesystem && existing) {
          const { saveRequestToDb } = await import("./collectionsSlice");
          await dispatch(
            saveRequestToDb({
              request: db.rowToRequest(existing),
              collectionId: archiveFolderId,
            }),
          ).unwrap();
        } else if (isFilesystem) {
          const { moveRequest } = await import("./collectionsSlice");
          await dispatch(
            moveRequest({
              id: action.requestId,
              newCollectionId: archiveFolderId,
            }),
          ).unwrap();
        } else {
          await db.moveRequest(action.requestId, archiveFolderId);
        }
      }

      if (action.kind === "delete" && action.requestId) {
        if (isFilesystem) {
          const { deleteRequestFromDb } = await import("./collectionsSlice");
          await dispatch(deleteRequestFromDb(action.requestId)).unwrap();
        } else {
          await db.deleteRequest(action.requestId);
        }
      }
    }

    await dispatch(fetchCollections());
    await dispatch(
      checkOpenApiDrift({ collectionRootId: report.collectionRootId }),
    );
    return {
      applied: plan.actions.filter((a) => a.kind !== "skip").length,
    };
  },
);

const openapiSlice = createSlice({
  name: "openapi",
  initialState,
  reducers: {
    closeConnectOpenApi(state) {
      state.connectOpen = false;
      state.connecting = false;
      state.error = null;
    },
    closeOpenApiSync(state) {
      state.syncOpen = false;
      state.checking = false;
      state.syncing = false;
      state.error = null;
    },
    setOpenApiSourceMode(state, action: PayloadAction<SpecSource>) {
      state.sourceMode = action.payload;
      state.error = null;
    },
    setOpenApiUrlInput(state, action: PayloadAction<string>) {
      state.urlInput = action.payload;
      state.error = null;
    },
    setOpenApiFilter(state, action: PayloadAction<OpenApiFilter>) {
      state.filter = action.payload;
    },
    setOpenApiSelectedIds(state, action: PayloadAction<string[]>) {
      state.selectedItemIds = action.payload;
    },
    toggleOpenApiItem(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.selectedItemIds.includes(id)) {
        state.selectedItemIds = state.selectedItemIds.filter((x) => x !== id);
      } else {
        state.selectedItemIds.push(id);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSpecLinks.fulfilled, (state, action) => {
        state.links = action.payload;
      })
      .addCase(openConnectOpenApi.fulfilled, (state, action) => {
        state.connectOpen = true;
        state.syncOpen = false;
        state.collectionRootId = action.payload.collectionRootId;
        state.error = null;
        state.fileContent = null;
        state.fileName = null;
        state.filePath = null;
      })
      .addCase(pickOpenApiSpecFile.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.fileContent = action.payload.content;
        state.fileName = action.payload.filename ?? null;
        state.filePath = action.payload.filePath ?? null;
        state.sourceMode = "file";
        state.error = null;
      })
      .addCase(connectOpenApiSpec.pending, (state) => {
        state.connecting = true;
        state.error = null;
      })
      .addCase(connectOpenApiSpec.fulfilled, (state, action) => {
        state.connecting = false;
        state.connectOpen = false;
        state.link = action.payload.link;
        state.collectionRootId = action.payload.link.collectionRootId;
        if (!action.payload.createdNew) {
          state.syncOpen = true;
        }
      })
      .addCase(connectOpenApiSpec.rejected, (state, action) => {
        state.connecting = false;
        state.error =
          action.error.message ?? "Failed to connect OpenAPI spec";
      })
      .addCase(openOpenApiSync.fulfilled, (state, action) => {
        state.syncOpen = true;
        state.connectOpen = false;
        state.collectionRootId = action.payload.collectionRootId;
        state.link = action.payload.link;
        state.report = null;
        state.error = null;
      })
      .addCase(openOpenApiSync.rejected, (state, action) => {
        state.error =
          action.error.message ?? "Failed to open OpenAPI sync";
      })
      .addCase(checkOpenApiDrift.pending, (state) => {
        state.checking = true;
        state.error = null;
      })
      .addCase(checkOpenApiDrift.fulfilled, (state, action) => {
        state.checking = false;
        state.report = action.payload.report;
        state.link = action.payload.link;
        state.selectedItemIds = action.payload.selectedItemIds;
      })
      .addCase(checkOpenApiDrift.rejected, (state, action) => {
        state.checking = false;
        state.error =
          action.error.message ?? "Failed to check OpenAPI drift";
      })
      .addCase(applyOpenApiSync.pending, (state) => {
        state.syncing = true;
        state.error = null;
      })
      .addCase(applyOpenApiSync.fulfilled, (state) => {
        state.syncing = false;
      })
      .addCase(applyOpenApiSync.rejected, (state, action) => {
        state.syncing = false;
        state.error =
          action.error.message ?? "Failed to sync OpenAPI changes";
      });
  },
});

export const {
  closeConnectOpenApi,
  closeOpenApiSync,
  setOpenApiSourceMode,
  setOpenApiUrlInput,
  setOpenApiFilter,
  setOpenApiSelectedIds,
  toggleOpenApiItem,
} = openapiSlice.actions;

export default openapiSlice.reducer;
