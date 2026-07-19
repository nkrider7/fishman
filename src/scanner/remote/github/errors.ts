export type GitHubErrorCode =
  | "InvalidGitHubUrl"
  | "RepoNotFound"
  | "RepoPrivateUnauthorized"
  | "RateLimited"
  | "NetworkError"
  | "RepoTooLarge"
  | "UnsupportedProject"
  | "GitHubApiError";

export class GitHubScanError extends Error {
  readonly code: GitHubErrorCode;
  readonly status?: number;

  constructor(code: GitHubErrorCode, message: string, status?: number) {
    super(message);
    this.name = "GitHubScanError";
    this.code = code;
    this.status = status;
  }
}

export function toUserFacingGitHubError(err: unknown): string {
  if (err instanceof GitHubScanError) return err.message;
  if (err instanceof Error) return err.message;
  return "GitHub scan failed.";
}
