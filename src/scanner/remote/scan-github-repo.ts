import { scanProject } from "../core/scanner";
import type { ScanProgress, ScanResult } from "../models/scan-result";
import { memoryFsFromEntries } from "./memory-fs";
import {
  fetchRawFile,
  fetchRepoMeta,
  fetchRepoTree,
  mapPool,
  type GitHubClientOptions,
} from "./github/client";
import { GitHubScanError } from "./github/errors";
import { planFilesToFetch } from "./github/fetch-planner";
import {
  formatGitHubRepoLabel,
  parseGitHubRepoUrl,
  type GitHubRepoRef,
} from "./github/parse-repo-url";

export interface ScanGitHubRepoInput {
  url: string;
  ref?: string;
  token?: string;
  baseUrl?: string;
  maxFiles?: number;
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
  /** Injected HTTP for tests. */
  clientOptions?: GitHubClientOptions;
}

export async function scanGitHubRepo(
  input: ScanGitHubRepoInput,
): Promise<ScanResult> {
  const onProgress = input.onProgress;
  const clientOptions: GitHubClientOptions = {
    ...input.clientOptions,
    token: input.token ?? input.clientOptions?.token,
  };

  onProgress?.({
    stage: "detecting-language",
    message: "Parsing GitHub URL...",
    percent: 2,
  });

  let repoRef: GitHubRepoRef;
  try {
    repoRef = parseGitHubRepoUrl(input.url);
  } catch (err) {
    throw err instanceof Error
      ? new GitHubScanError("InvalidGitHubUrl", err.message)
      : new GitHubScanError("InvalidGitHubUrl", "Invalid GitHub URL.");
  }

  if (input.ref?.trim()) {
    repoRef = { ...repoRef, ref: input.ref.trim() };
  }

  onProgress?.({
    stage: "detecting-language",
    message: `Resolving ${formatGitHubRepoLabel(repoRef)}...`,
    percent: 8,
  });

  throwIfAborted(input.signal);

  const meta = await fetchRepoMeta(repoRef, clientOptions);
  const branch = repoRef.ref?.trim() || meta.defaultBranch;

  onProgress?.({
    stage: "discovering-files",
    message: `Fetching file tree @ ${branch}...`,
    percent: 15,
  });

  throwIfAborted(input.signal);
  const { tree, truncated: apiTruncated } = await fetchRepoTree(
    repoRef,
    branch,
    clientOptions,
  );

  const planned = planFilesToFetch(tree, {
    maxFiles: input.maxFiles,
    subpath: repoRef.subpath,
  });

  const warnings = [...planned.warnings];
  if (apiTruncated) {
    warnings.push(
      "GitHub reported a truncated tree. Very large repos may miss some files.",
    );
  }

  if (planned.files.length === 0) {
    throw new GitHubScanError(
      "UnsupportedProject",
      "No scannable source files found in this repository.",
    );
  }

  onProgress?.({
    stage: "discovering-files",
    message: `Downloading ${planned.files.length} files...`,
    percent: 25,
    totalFiles: planned.files.length,
  });

  throwIfAborted(input.signal);

  let completed = 0;
  const entries = await mapPool(
    planned.files,
    8,
    async (file) => {
      throwIfAborted(input.signal);
      try {
        const content = await fetchRawFile(
          repoRef,
          branch,
          file.path,
          clientOptions,
        );
        completed += 1;
        if (completed % 5 === 0 || completed === planned.files.length) {
          onProgress?.({
            stage: "parsing",
            message: `Downloading files (${completed}/${planned.files.length})...`,
            percent:
              25 +
              Math.round((completed / Math.max(planned.files.length, 1)) * 35),
            filesProcessed: completed,
            totalFiles: planned.files.length,
          });
        }
        return { path: file.path, content };
      } catch (err) {
        warnings.push(
          `Failed to download ${file.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    },
    input.signal,
  );

  const downloaded = entries.filter(
    (e): e is { path: string; content: string } => e != null,
  );

  if (downloaded.length === 0) {
    throw new GitHubScanError(
      "NetworkError",
      "Could not download any source files from GitHub.",
    );
  }

  const fs = memoryFsFromEntries(downloaded);

  onProgress?.({
    stage: "detecting-framework",
    message: "Scanning downloaded sources...",
    percent: 65,
  });

  const result = await scanProject(fs, {
    projectPath: fs.root,
    baseUrl: input.baseUrl,
    maxFiles: input.maxFiles,
    onProgress: (p) => {
      onProgress?.({
        ...p,
        percent: Math.min(99, 65 + Math.round((p.percent / 100) * 34)),
      });
    },
  });

  return {
    ...result,
    projectPath: `github://${meta.fullName}@${branch}`,
    warnings: [
      ...warnings.map((message) => ({
        message,
        severity: "warning" as const,
      })),
      ...result.warnings,
    ],
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new GitHubScanError("NetworkError", "Scan cancelled.");
  }
}
