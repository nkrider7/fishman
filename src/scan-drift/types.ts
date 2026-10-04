import type { ApiEndpoint } from "@/scanner/models/endpoint";
import type {
  HttpMethod,
  RequestDraft,
  RequestScanMeta,
} from "@/types/request";

export type { RequestScanMeta };
export type RequestOrigin = RequestScanMeta["origin"];

export type ScanLinkSource = "local" | "github";

/** Durable link between a collection root and a scanned project. */
export interface ScanLink {
  collectionRootId: string;
  source: ScanLinkSource;
  /** Absolute local path (local scans). */
  projectPath?: string;
  githubUrl?: string;
  githubRef?: string;
  language?: string;
  frameworks?: string[];
  lastScanAt: number;
  lastScanFingerprint: string;
  baseUrl?: string;
  /** Opt-in; v1 UI may leave this false. */
  watchEnabled: boolean;
  collectionName?: string;
}

export type DriftKind =
  | "added"
  | "removed"
  | "changed"
  | "unchanged"
  | "manual_only";

export interface DriftFieldChange {
  field: string;
  before: string;
  after: string;
}

export interface DriftItem {
  id: string;
  kind: DriftKind;
  scanKey: string;
  method: HttpMethod | string;
  path: string;
  name?: string;
  sourceFile?: string;
  summary: string;
  /** Present for added / changed */
  endpoint?: ApiEndpoint;
  /** Present for removed / changed / manual_only / unchanged */
  requestId?: string;
  draft?: RequestDraft;
  fieldChanges?: DriftFieldChange[];
  /** True when changed but userLocked — sync must skip overwrite. */
  locked?: boolean;
}

export interface DriftSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  manualOnly: number;
}

export interface DriftReport {
  collectionRootId: string;
  projectLabel: string;
  scannedAt: number;
  summary: DriftSummary;
  items: DriftItem[];
  warnings: string[];
  scanResultMeta: {
    language: string;
    frameworks: string[];
    durationMs: number;
  };
}

export interface CollectionRequestRef {
  id: string;
  collectionId: string | null;
  draft: RequestDraft;
  /** Folder path segments under the collection root (for display). */
  folderPath?: string[];
}

export interface SyncOptions {
  /** Overwrite locked requests (default false). */
  overwriteLocked?: boolean;
  /** Hard-delete removed instead of moving to archive folder (default false). */
  hardDeleteRemoved?: boolean;
  archiveFolderName?: string;
}

export type SyncActionKind = "create" | "update" | "archive" | "delete" | "skip";

export interface SyncAction {
  kind: SyncActionKind;
  itemId: string;
  scanKey: string;
  requestId?: string;
  endpoint?: ApiEndpoint;
  /** Patched draft for update/create */
  draft?: RequestDraft;
  folderPath?: string[];
  reason?: string;
}

export interface SyncPlan {
  actions: SyncAction[];
  archiveFolderName: string;
  warnings: string[];
}

export const DEFAULT_ARCHIVE_FOLDER = "_Removed by scan";
