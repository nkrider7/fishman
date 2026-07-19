export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted"
  | "ignored";

export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  /** Staged in the index */
  staged: boolean;
  oldPath?: string;
}

export type { GitFileDiff, GitDiffHunk, GitDiffLine } from "./file-diff";

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitCommitInfo {
  oid: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
  /** Local branches that contain this commit */
  branches: string[];
  /** Local branches whose tip points at this commit */
  tips: string[];
}

export interface GitRepoStatus {
  enabled: boolean;
  /** Absolute path to project root containing `.git`. */
  projectPath: string;
  branch: string | null;
  detachedHead: boolean;
  changes: GitFileChange[];
  ahead: number;
  behind: number;
  hasRemote: boolean;
  remotes: GitRemote[];
  upstream: string | null;
  lastFetchedAt: number | null;
}

export interface GitDetectionResult {
  hasGit: boolean;
  projectPath: string;
  gitDir: string | null;
}

/** Operations contract — isomorphic-git (preferred) or git2 behind this facade. */
export interface GitOperations {
  status(projectPath: string): Promise<GitRepoStatus>;
  init(projectPath: string): Promise<void>;
  stage(projectPath: string, paths: string[]): Promise<void>;
  unstage(projectPath: string, paths: string[]): Promise<void>;
  commit(projectPath: string, message: string): Promise<string>;
  discard(projectPath: string, paths: string[]): Promise<void>;
  pull(projectPath: string): Promise<void>;
  push(projectPath: string): Promise<void>;
  fetch(projectPath: string): Promise<void>;
  checkout(projectPath: string, ref: string): Promise<void>;
  createBranch(projectPath: string, name: string): Promise<void>;
  currentBranch(projectPath: string): Promise<string | null>;
  listBranches(projectPath: string): Promise<string[]>;
  log(projectPath: string, limit?: number): Promise<GitCommitInfo[]>;
  listRemotes(projectPath: string): Promise<GitRemote[]>;
  addRemote(projectPath: string, name: string, url: string): Promise<void>;
  removeRemote(projectPath: string, name: string): Promise<void>;
  getFileDiff(
    projectPath: string,
    path: string,
    options?: { staged?: boolean; status?: GitFileStatus },
  ): Promise<import("./file-diff").GitFileDiff>;
}
