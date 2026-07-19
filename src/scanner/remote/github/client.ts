import { executeRequest } from "@/tauri/http";
import type { HttpRequestPayload } from "@/types/response";
import type { GitHubRepoRef } from "./parse-repo-url";
import { GitHubScanError } from "./errors";
import type { GitTreeItem } from "./fetch-planner";

export interface GitHubHttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export type GitHubHttpGet = (
  url: string,
  headers?: Record<string, string>,
) => Promise<GitHubHttpResponse>;

const USER_AGENT = "Fishman-Scanner/0.1.0";

export async function defaultGitHubHttpGet(
  url: string,
  headers: Record<string, string> = {},
): Promise<GitHubHttpResponse> {
  const payload: HttpRequestPayload = {
    method: "GET",
    url,
    headers: [
      { key: "User-Agent", value: USER_AGENT, enabled: true },
      { key: "Accept", value: "application/vnd.github+json", enabled: true },
      ...Object.entries(headers).map(([key, value]) => ({
        key,
        value,
        enabled: true,
      })),
    ],
    body_type: "none",
    timeout_ms: 60_000,
    ignore_ssl: false,
  };

  const res = await executeRequest(payload);
  if (res.error && res.status === 0) {
    throw new GitHubScanError("NetworkError", res.error);
  }
  return {
    status: res.status,
    body: res.body,
    headers: res.headers ?? {},
  };
}

export interface GitHubClientOptions {
  token?: string;
  httpGet?: GitHubHttpGet;
}

function authHeaders(token?: string): Record<string, string> {
  if (!token?.trim()) return {};
  return { Authorization: `Bearer ${token.trim()}` };
}

function throwForStatus(status: number, body: string, context: string): never {
  if (status === 404) {
    throw new GitHubScanError(
      "RepoNotFound",
      "Repository not found. Check the URL or whether the repo is private.",
      status,
    );
  }
  if (status === 401 || status === 403) {
    const lower = body.toLowerCase();
    if (lower.includes("rate limit") || lower.includes("api rate limit")) {
      throw new GitHubScanError(
        "RateLimited",
        "GitHub API rate limit reached. Wait a bit or add a personal access token.",
        status,
      );
    }
    throw new GitHubScanError(
      "RepoPrivateUnauthorized",
      "Access denied. For private repos, provide a GitHub personal access token.",
      status,
    );
  }
  throw new GitHubScanError(
    "GitHubApiError",
    `${context} failed (HTTP ${status}).`,
    status,
  );
}

export interface RepoMeta {
  defaultBranch: string;
  fullName: string;
  private: boolean;
}

export async function fetchRepoMeta(
  ref: GitHubRepoRef,
  options: GitHubClientOptions = {},
): Promise<RepoMeta> {
  const httpGet = options.httpGet ?? defaultGitHubHttpGet;
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}`;
  const res = await httpGet(url, authHeaders(options.token));
  if (res.status < 200 || res.status >= 300) {
    throwForStatus(res.status, res.body, "Resolve repository");
  }
  const data = JSON.parse(res.body) as {
    default_branch?: string;
    full_name?: string;
    private?: boolean;
  };
  return {
    defaultBranch: data.default_branch ?? "main",
    fullName: data.full_name ?? `${ref.owner}/${ref.repo}`,
    private: Boolean(data.private),
  };
}

export async function fetchRepoTree(
  ref: GitHubRepoRef,
  branch: string,
  options: GitHubClientOptions = {},
): Promise<{ tree: GitTreeItem[]; truncated: boolean }> {
  const httpGet = options.httpGet ?? defaultGitHubHttpGet;
  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await httpGet(url, authHeaders(options.token));
  if (res.status < 200 || res.status >= 300) {
    throwForStatus(res.status, res.body, "Fetch repository tree");
  }
  const data = JSON.parse(res.body) as {
    tree?: GitTreeItem[];
    truncated?: boolean;
  };
  return {
    tree: data.tree ?? [],
    truncated: Boolean(data.truncated),
  };
}

export async function fetchRawFile(
  ref: GitHubRepoRef,
  branch: string,
  path: string,
  options: GitHubClientOptions = {},
): Promise<string> {
  const httpGet = options.httpGet ?? defaultGitHubHttpGet;
  const encodedPath = path
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  const url = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${encodedPath}`;
  const headers: Record<string, string> = {
    Accept: "text/plain",
    ...authHeaders(options.token),
  };
  const res = await httpGet(url, headers);
  if (res.status < 200 || res.status >= 300) {
    throwForStatus(res.status, res.body, `Fetch file ${path}`);
  }
  return res.body;
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      if (signal?.aborted) {
        throw new GitHubScanError("NetworkError", "Scan cancelled.");
      }
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
