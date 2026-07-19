/**
 * Optional HTTPS credentials for remotes.
 * Prefer a PAT as password (GitHub) or username+password.
 */
export interface GitAuthCredentials {
  username: string;
  password: string;
}

let cachedAuth: GitAuthCredentials | null = null;

export function setGitAuthCredentials(
  credentials: GitAuthCredentials | null,
): void {
  cachedAuth = credentials;
}

export function getGitAuthCredentials(): GitAuthCredentials | null {
  return cachedAuth;
}

export function createOnAuth() {
  return () => {
    if (cachedAuth) {
      return {
        username: cachedAuth.username,
        password: cachedAuth.password,
      };
    }
    return undefined;
  };
}

export function createOnAuthFailure() {
  return async () => ({ cancel: true as const });
}

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function formatGitError(error: unknown): string {
  const message = rawMessage(error);

  // Tauri FS denials look like "forbidden path: …" / plugin Forbidden —
  // not GitHub/remote auth. Detect before generic 403 mapping.
  if (
    /forbidden path|path not allowed|not allowed by the scope|scope|os error 13/i.test(
      message,
    ) ||
    (/Forbidden|403/i.test(message) &&
      /path|fs|filesystem|plugin/i.test(message))
  ) {
    return `Folder access denied by the app. Pick a folder under your Home directory and ensure Fishman can write there (including .git / .gitignore). Details: ${message}`;
  }

  if (/401|Unauthorized|authentication failed|invalid credentials/i.test(message)) {
    return "Authentication failed. Add HTTPS credentials (e.g. GitHub PAT) or use a public remote.";
  }
  if (/Could not find|not a git repository|ENOENT.*\.git/i.test(message)) {
    return "Not a Git repository. Initialize Git first.";
  }
  if (
    /does not have any commits|unborn|no HEAD commit|Resolved to commit object of type undefined/i.test(
      message,
    )
  ) {
    return "This branch has no commits yet. Stage files and make your first commit.";
  }
  if (/checkout.*local changes|would be overwritten|dirty/i.test(message)) {
    return "You have local changes that would be overwritten. Commit or discard them first.";
  }
  if (/rejected|non-fast-forward/i.test(message)) {
    return "Push rejected (non-fast-forward). Pull remote changes first.";
  }
  if (/Merge conflict|CONFLICT/i.test(message)) {
    return "Merge conflict. Resolve conflicts and try again.";
  }
  if (/Failed to fetch|ENOTFOUND|network|cors/i.test(message)) {
    return `Network error talking to remote: ${message}`;
  }
  // Remaining bare "403 Forbidden" after FS check — likely remote ACL
  if (/^403|Forbidden/i.test(message.trim())) {
    return "Access denied by the remote. Check repository permissions.";
  }
  return message || "Git operation failed";
}
