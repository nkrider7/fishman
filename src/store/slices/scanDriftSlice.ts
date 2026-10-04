import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  scanProject,
  createTauriFileSystem,
  scanGitHubRepo,
  toUserFacingGitHubError,
} from "@/scanner";
import type { ScanProgress } from "@/scanner/models/scan-result";
import { fetchCollections } from "@/store/slices/collectionsSlice";
import {
  buildDriftReport,
  buildSyncPlan,
  selectSafeSyncIds,
  type DriftKind,
  type DriftReport,
  type ScanLink,
  type SyncOptions,
} from "@/scan-drift";
import { collectRequestsUnderRoot, projectLabelFromLink } from "@/scan-drift/collection-requests";
import { getScanLink, listScanLinks, upsertScanLink } from "@/scan-drift/scan-link-store";
import { fingerprintEndpoints } from "@/scan-drift/fingerprint";
import { endpointToSyncedDraftWithBase } from "@/scan-drift/apply";
import * as db from "@/services/dbService";
import type { RootState } from "@/store";

export type DriftFilter = "all" | DriftKind;

interface ScanDriftState {
  open: boolean;
  collectionRootId: string | null;
  link: ScanLink | null;
  report: DriftReport | null;
  selectedItemIds: string[];
  filter: DriftFilter;
  scanning: boolean;
  syncing: boolean;
  progress: ScanProgress | null;
  error: string | null;
  /** Soft badge: project files changed (watch stub). */
  stale: boolean;
  links: ScanLink[];
}

const initialState: ScanDriftState = {
  open: false,
  collectionRootId: null,
  link: null,
  report: null,
  selectedItemIds: [],
  filter: "all",
  scanning: false,
  syncing: false,
  progress: null,
  error: null,
  stale: false,
  links: [],
};

export const loadScanLinks = createAsyncThunk("scanDrift/loadLinks", async () => {
  return listScanLinks();
});

export const openScanDrift = createAsyncThunk(
  "scanDrift/open",
  async (collectionRootId: string | undefined, { dispatch }) => {
    let rootId = collectionRootId;
    if (!rootId) {
      const links = await listScanLinks();
      rootId = links[0]?.collectionRootId;
    }
    if (!rootId) {
      throw new Error(
        "No scanned collection linked yet. Import a project with the Scanner first.",
      );
    }
    const link = await getScanLink(rootId);
    if (!link) {
      throw new Error(
        "This collection is not linked to a scanned project. Run Scanner → Import first.",
      );
    }
    void dispatch(loadScanLinks());
    return { collectionRootId: rootId, link };
  },
);

export const checkScanDrift = createAsyncThunk(
  "scanDrift/check",
  async (
    payload: { collectionRootId?: string } | undefined,
    { getState, dispatch },
  ) => {
    const state = getState() as RootState;
    const rootId =
      payload?.collectionRootId ??
      state.scanDrift.collectionRootId ??
      undefined;
    if (!rootId) {
      throw new Error("No collection selected for Scan Drift.");
    }

    let link = await getScanLink(rootId);
    if (!link) {
      throw new Error(
        "No Scan Link for this collection. Import via Scanner to create one.",
      );
    }

    const onProgress = (progress: ScanProgress) => {
      dispatch(setDriftProgress(progress));
    };

    let scanResult;
    try {
      if (link.source === "github" && link.githubUrl) {
        scanResult = await scanGitHubRepo({
          url: link.githubUrl,
          ref: link.githubRef,
          baseUrl: link.baseUrl,
          onProgress,
        });
      } else if (link.projectPath) {
        const fs = createTauriFileSystem();
        scanResult = await scanProject(fs, {
          projectPath: link.projectPath,
          baseUrl: link.baseUrl,
          onProgress,
        });
      } else {
        throw new Error(
          "Scan Link is missing a project path. Re-import from Scanner.",
        );
      }
    } catch (err) {
      if (link.source === "github") {
        throw new Error(toUserFacingGitHubError(err));
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    // Ensure collections are fresh
    await dispatch(fetchCollections());
    const nextState = getState() as RootState;
    const requests = collectRequestsUnderRoot(
      rootId,
      nextState.collections.folders,
      nextState.collections.requests,
    );

    const warnings = scanResult.warnings.map((w) =>
      typeof w === "string" ? w : w.message,
    );

    const report = buildDriftReport({
      collectionRootId: rootId,
      projectLabel: projectLabelFromLink(link),
      requests,
      endpoints: scanResult.endpoints,
      warnings,
      scanResultMeta: {
        language: scanResult.language,
        frameworks: scanResult.frameworks,
        durationMs: scanResult.durationMs,
      },
    });

    link = await upsertScanLink({
      ...link,
      language: scanResult.language,
      frameworks: scanResult.frameworks,
      lastScanAt: Date.now(),
      lastScanFingerprint: fingerprintEndpoints(scanResult.endpoints),
    });

    const selectable = report.items
      .filter(
        (i) =>
          i.kind === "added" ||
          i.kind === "removed" ||
          (i.kind === "changed" && !i.locked),
      )
      .map((i) => i.id);

    return { report, link, selectedItemIds: selectable };
  },
);

export const applyScanDriftSync = createAsyncThunk(
  "scanDrift/apply",
  async (
    payload: {
      itemIds?: string[];
      options?: SyncOptions;
      mode?: "selected" | "safe";
    },
    { getState, dispatch },
  ) => {
    const state = getState() as RootState;
    const report = state.scanDrift.report;
    const link = state.scanDrift.link;
    if (!report || !link) {
      throw new Error("Run Check for drift before syncing.");
    }

    const itemIds =
      payload.mode === "safe"
        ? selectSafeSyncIds(report)
        : (payload.itemIds ?? state.scanDrift.selectedItemIds);

    if (itemIds.length === 0) {
      throw new Error("Select at least one drift item to sync.");
    }

    const plan = buildSyncPlan(report, itemIds, payload.options);
    const workspaceId = state.workspaces.activeWorkspaceId;
    const isFilesystem = state.collections.sourceMode === "filesystem";

    // Resolve / create archive folder once if needed
    let archiveFolderId: string | null = null;
    const needsArchive = plan.actions.some((a) => a.kind === "archive");
    if (needsArchive) {
      if (isFilesystem) {
        const { createFolder } = await import("@/store/slices/collectionsSlice");
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

    // Folder cache for creates: path key → folder id
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
          const { createFolder } = await import(
            "@/store/slices/collectionsSlice"
          );
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
        const draft = endpointToSyncedDraftWithBase(
          action.endpoint,
          link.baseUrl,
        );
        const folderId = await ensureFolderPath(
          action.folderPath ?? ["General"],
        );
        if (isFilesystem) {
          const { saveRequestToDb } = await import(
            "@/store/slices/collectionsSlice"
          );
          await dispatch(
            saveRequestToDb({ request: draft, collectionId: folderId }),
          ).unwrap();
        } else {
          await db.saveRequest(draft, folderId);
        }
      }

      if (action.kind === "update" && action.draft && action.requestId) {
        const draft = { ...action.draft, id: action.requestId };
        if (isFilesystem) {
          const { saveRequestToDb } = await import(
            "@/store/slices/collectionsSlice"
          );
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
          const { saveRequestToDb } = await import(
            "@/store/slices/collectionsSlice"
          );
          await dispatch(
            saveRequestToDb({
              request: db.rowToRequest(existing),
              collectionId: archiveFolderId,
            }),
          ).unwrap();
        } else if (isFilesystem) {
          const { moveRequest } = await import(
            "@/store/slices/collectionsSlice"
          );
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
          const { deleteRequestFromDb } = await import(
            "@/store/slices/collectionsSlice"
          );
          await dispatch(deleteRequestFromDb(action.requestId)).unwrap();
        } else {
          await db.deleteRequest(action.requestId);
        }
      }
    }

    await dispatch(fetchCollections());
    // Refresh drift after sync
    await dispatch(checkScanDrift({ collectionRootId: report.collectionRootId }));
    return { applied: plan.actions.filter((a) => a.kind !== "skip").length };
  },
);

const scanDriftSlice = createSlice({
  name: "scanDrift",
  initialState,
  reducers: {
    closeScanDrift(state) {
      state.open = false;
      state.error = null;
      state.progress = null;
      state.scanning = false;
      state.syncing = false;
    },
    setDriftFilter(state, action: PayloadAction<DriftFilter>) {
      state.filter = action.payload;
    },
    setDriftSelectedIds(state, action: PayloadAction<string[]>) {
      state.selectedItemIds = action.payload;
    },
    toggleDriftItem(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.selectedItemIds.includes(id)) {
        state.selectedItemIds = state.selectedItemIds.filter((x) => x !== id);
      } else {
        state.selectedItemIds.push(id);
      }
    },
    setDriftProgress(state, action: PayloadAction<ScanProgress | null>) {
      state.progress = action.payload;
    },
    setDriftStale(state, action: PayloadAction<boolean>) {
      state.stale = action.payload;
    },
    clearDriftError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadScanLinks.fulfilled, (state, action) => {
        state.links = action.payload;
      })
      .addCase(openScanDrift.pending, (state) => {
        state.error = null;
      })
      .addCase(openScanDrift.fulfilled, (state, action) => {
        state.open = true;
        state.collectionRootId = action.payload.collectionRootId;
        state.link = action.payload.link;
        state.report = null;
        state.selectedItemIds = [];
        state.filter = "all";
        state.stale = false;
        state.error = null;
      })
      .addCase(openScanDrift.rejected, (state, action) => {
        state.open = true;
        state.error = action.error.message ?? "Could not open Scan Drift";
      })
      .addCase(checkScanDrift.pending, (state) => {
        state.scanning = true;
        state.error = null;
        state.progress = null;
      })
      .addCase(checkScanDrift.fulfilled, (state, action) => {
        state.scanning = false;
        state.report = action.payload.report;
        state.link = action.payload.link;
        state.selectedItemIds = action.payload.selectedItemIds;
        state.stale = false;
        state.progress = null;
      })
      .addCase(checkScanDrift.rejected, (state, action) => {
        state.scanning = false;
        state.progress = null;
        state.error = action.error.message ?? "Drift check failed";
      })
      .addCase(applyScanDriftSync.pending, (state) => {
        state.syncing = true;
        state.error = null;
      })
      .addCase(applyScanDriftSync.fulfilled, (state) => {
        state.syncing = false;
      })
      .addCase(applyScanDriftSync.rejected, (state, action) => {
        state.syncing = false;
        state.error = action.error.message ?? "Sync failed";
      });
  },
});

export const {
  closeScanDrift,
  setDriftFilter,
  setDriftSelectedIds,
  toggleDriftItem,
  setDriftProgress,
  setDriftStale,
  clearDriftError,
} = scanDriftSlice.actions;

export default scanDriftSlice.reducer;
