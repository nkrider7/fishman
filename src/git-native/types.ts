import type {
  FishAuth,
  FishEnvironment,
  FishFolderMeta,
  FishKeyValue,
  FishRequest,
  FishScripts,
  FishWorkspace,
} from "./schema";

export type CollectionSourceKind = "filesystem";
export type CollectionSyncStatus =
  | "synced"
  | "dirty"
  | "conflict"
  | "error"
  | "unknown";

export interface CollectionSource {
  kind: CollectionSourceKind;
  /** Absolute path to the fishman workspace root (…/fishman or …/fishman/Backend). */
  rootPath: string;
  /** Project root that contains `.git` and `fishman/`. */
  projectPath?: string;
  syncStatus?: CollectionSyncStatus;
  lastSyncedAt?: number;
}

export interface FishFolderNode {
  id: string;
  name: string;
  /** Path relative to workspace root, e.g. `collections/Users`. */
  relativePath: string;
  seq: number;
  meta: FishFolderMeta;
  folders: FishFolderNode[];
  requests: FishRequestNode[];
}

export interface FishRequestNode {
  id: string;
  name: string;
  /** Path relative to workspace root, e.g. `collections/Users/Get Users.fish`. */
  relativePath: string;
  request: FishRequest;
}

export interface FishEnvironmentNode {
  id: string;
  name: string;
  relativePath: string;
  secretsRelativePath?: string;
  environment: FishEnvironment;
  secretVariables: FishKeyValue[];
}

/** Loaded fishman workspace (source of truth = disk). */
export interface FishmanWorkspaceGraph {
  source: CollectionSource;
  workspace: FishWorkspace;
  collectionsRoot: FishFolderNode;
  environments: FishEnvironmentNode[];
}

export interface EffectiveRequestSettings {
  headers: FishKeyValue[];
  auth: FishAuth;
  scripts: FishScripts;
}

/** @deprecated Alias during migration from YAML graph naming. */
export type CollectionGraph = FishmanWorkspaceGraph;
export type GitNativeFolderNode = FishFolderNode;
export type GitNativeRequestNode = FishRequestNode;
export type GitNativeEnvironmentNode = FishEnvironmentNode;
