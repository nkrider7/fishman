export {
  detectGit,
  getEmptyGitStatus,
} from "./detect";
export type {
  GitCommitInfo,
  GitDetectionResult,
  GitFileChange,
  GitFileDiff,
  GitFileStatus,
  GitOperations,
  GitRemote,
  GitRepoStatus,
} from "./types";
export { buildFileDiff } from "./file-diff";
export type { GitDiffHunk, GitDiffLine } from "./file-diff";
export {
  createGitOperations,
  getGitOperations,
} from "./operations";
export {
  createOnAuth,
  createOnAuthFailure,
  formatGitError,
  getGitAuthCredentials,
  setGitAuthCredentials,
} from "./auth";
export type { GitAuthCredentials } from "./auth";
export { mapStatusMatrixRow, expandStatusLetter } from "./status-map";
export type { StatusMatrixRow } from "./status-map";
export {
  isDetachedHeadContents,
  mergeLocalBranches,
  normalizeBranchName,
  parseSymbolicHeadBranch,
} from "./head-branch";
