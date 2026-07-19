import type { GitNativeFs } from "../fs";
import type { GitDetectionResult, GitRepoStatus } from "./types";

export type {
  GitCommitInfo,
  GitDetectionResult,
  GitFileChange,
  GitFileStatus,
  GitOperations,
  GitRemote,
  GitRepoStatus,
} from "./types";

/**
 * Detect `.git` under the project root (directory or gitfile).
 * Does not shell out — filesystem probe only.
 */
export async function detectGit(
  fs: GitNativeFs,
  projectPath: string,
): Promise<GitDetectionResult> {
  const gitDir = fs.join(projectPath, ".git");
  const hasGit = await fs.exists(gitDir);
  return {
    hasGit,
    projectPath,
    gitDir: hasGit ? gitDir : null,
  };
}

/**
 * Placeholder status for tests / UI before full refresh.
 */
export async function getEmptyGitStatus(
  projectPath: string,
  detection: GitDetectionResult,
): Promise<GitRepoStatus> {
  return {
    enabled: detection.hasGit,
    projectPath,
    branch: detection.hasGit ? "unknown" : null,
    detachedHead: false,
    changes: [],
    ahead: 0,
    behind: 0,
    hasRemote: false,
    remotes: [],
    upstream: null,
    lastFetchedAt: null,
  };
}
