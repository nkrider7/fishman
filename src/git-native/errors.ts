export type GitNativeErrorCode =
  | "NOT_A_COLLECTION"
  | "INVALID_CONFIG"
  | "INVALID_DOCUMENT"
  | "PATH_ESCAPE"
  | "IO"
  | "UNSUPPORTED_VERSION"
  | "CONFLICT"
  | "GIT_MISSING"
  | "GIT_ERROR"
  | "PERMISSION_DENIED"
  | "DETACHED_HEAD";


export class GitNativeError extends Error {
  readonly code: GitNativeErrorCode;
  readonly path?: string;
  readonly cause?: unknown;

  constructor(
    code: GitNativeErrorCode,
    message: string,
    options?: { path?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "GitNativeError";
    this.code = code;
    this.path = options?.path;
    this.cause = options?.cause;
  }
}

export function isGitNativeError(error: unknown): error is GitNativeError {
  return error instanceof GitNativeError;
}
