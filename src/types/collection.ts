import type { AuthConfig, HttpMethod, KeyValue, RequestScripts } from "./request";
import { EMPTY_SCRIPTS } from "./request";

/** How a root collection is persisted. Filesystem = Git-native folder. */
export type CollectionSourceKind = "sqlite" | "filesystem";

export type CollectionSyncStatus =
  | "synced"
  | "dirty"
  | "conflict"
  | "error"
  | "unknown";

export interface CollectionSource {
  kind: CollectionSourceKind;
  /** Absolute path to the collection root when kind is filesystem. */
  rootPath?: string;
  syncStatus?: CollectionSyncStatus;
  lastSyncedAt?: number;
}

export interface PostResponseVar {
  id: string;
  key: string;
  /** JSONPath-lite expression, e.g. $.data.token */
  expr: string;
  enabled: boolean;
}

export interface FolderPresets {
  defaultMethod?: HttpMethod;
  baseUrl?: string;
}

export interface FolderSettings {
  description: string;
  headers: KeyValue[];
  variables: KeyValue[];
  postResponseVars: PostResponseVar[];
  auth: AuthConfig;
  scripts: RequestScripts;
  presets: FolderPresets;
}

export const EMPTY_FOLDER_SETTINGS: FolderSettings = {
  description: "",
  headers: [],
  variables: [],
  postResponseVars: [],
  auth: { type: "none" },
  scripts: { ...EMPTY_SCRIPTS },
  presets: {},
};

export interface CollectionFolder {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  children?: CollectionNode[];
  /** Present on root collections when linked to a Git-native folder. */
  source?: CollectionSource;
  source_kind?: CollectionSourceKind;
  source_path?: string | null;
  sync_status?: CollectionSyncStatus | null;
  last_synced_at?: number | null;
  /** Inherited settings (Bruno-style). Optional for legacy rows. */
  description?: string;
  headers_json?: string;
  variables_json?: string;
  post_response_vars_json?: string;
  auth_type?: string;
  auth_json?: string;
  scripts_json?: string;
  presets_json?: string;
}

export interface SavedRequest {
  id: string;
  collection_id: string | null;
  name: string;
  method: string;
  url: string;
  headers_json: string;
  params_json: string;
  body_type: string;
  body_json: string;
  auth_type: string;
  auth_json: string;
  scripts_json?: string;
  /** JSON string array of tag labels for runner filters. */
  tags_json?: string;
  is_favorite: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
  /** Filesystem / git-native metadata (not used for sqlite personal rows). */
  source_kind?: CollectionSourceKind;
  source_path?: string | null;
  sync_status?: CollectionSyncStatus | null;
}

export type CollectionNode =
  | (CollectionFolder & { type: "folder" })
  | (SavedRequest & { type: "request" });

export interface Workspace {
  id: string;
  name: string;
  created_at: number;
}

export function parseFolderSettings(folder: CollectionFolder): FolderSettings {
  return {
    description: folder.description ?? "",
    headers: parseJsonArray<KeyValue>(folder.headers_json),
    variables: parseJsonArray<KeyValue>(folder.variables_json),
    postResponseVars: parseJsonArray<PostResponseVar>(
      folder.post_response_vars_json,
    ),
    auth: parseAuth(folder.auth_json, folder.auth_type),
    scripts: parseScripts(folder.scripts_json),
    presets: parsePresets(folder.presets_json),
  };
}

function parseJsonArray<T>(raw?: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseAuth(raw?: string | null, authType?: string): AuthConfig {
  try {
    const parsed = JSON.parse(raw || "{}") as AuthConfig;
    if (parsed && typeof parsed === "object" && parsed.type) return parsed;
  } catch {
    // fall through
  }
  const type = (authType as AuthConfig["type"]) || "none";
  return { type: type === "inherit" ? "none" : type };
}

function parseScripts(raw?: string | null): RequestScripts {
  if (!raw) return { ...EMPTY_SCRIPTS };
  try {
    const parsed = JSON.parse(raw) as Partial<RequestScripts>;
    return {
      preRequest: parsed.preRequest ?? "",
      postResponse: parsed.postResponse ?? "",
      tests: parsed.tests ?? "",
    };
  } catch {
    return { ...EMPTY_SCRIPTS };
  }
}

function parsePresets(raw?: string | null): FolderPresets {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as FolderPresets;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
