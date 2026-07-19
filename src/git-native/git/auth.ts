/**
 * Optional HTTPS credentials for remotes.
 * Prefer a PAT as password (GitHub) or username+password.
 *
 * Stored in localStorage for the session machine only — never committed.
 */
export interface GitAuthCredentials {
  username: string;
  password: string;
}

const STORAGE_KEY = "fishman.git.httpsAuth";

let cachedAuth: GitAuthCredentials | null = null;

function readStored(): GitAuthCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GitAuthCredentials;
    if (
      parsed &&
      typeof parsed.username === "string" &&
      typeof parsed.password === "string" &&
      parsed.password
    ) {
      return { username: parsed.username || "git", password: parsed.password };
    }
  } catch {
    // ignore
  }
  return null;
}

function writeStored(credentials: GitAuthCredentials | null): void {
  try {
    if (!credentials) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // ignore quota / private mode
  }
}

export function setGitAuthCredentials(
  credentials: GitAuthCredentials | null,
  options?: { persist?: boolean },
): void {
  cachedAuth = credentials
    ? {
        username: credentials.username.trim() || "git",
        password: credentials.password,
      }
    : null;
  if (options?.persist !== false) {
    writeStored(cachedAuth);
  }
}

export function getGitAuthCredentials(): GitAuthCredentials | null {
  if (cachedAuth) return cachedAuth;
  cachedAuth = readStored();
  return cachedAuth;
}

export function createOnAuth() {
  return () => {
    const auth = getGitAuthCredentials();
    if (auth) {
      return {
        username: auth.username,
        password: auth.password,
      };
    }
    // GitHub accepts any non-empty username with a PAT as password
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

  // WebKit / browser-fetch failure (old http/web path)
  if (/^Load failed$|Failed to fetch|TypeError:\s*Load failed/i.test(message.trim())) {
    return "Could not reach the remote from the UI webview. Fishman now uses a native HTTP client — fully restart the app (stop tauri dev and start again), then retry Fetch. For private repos, set a GitHub PAT under Sync → GitHub credentials.";
  }

  if (/401|Unauthorized|authentication failed|invalid credentials|HTTP Error:\s*401/i.test(message)) {
    return "Authentication failed. Open Sync → set a GitHub Personal Access Token (PAT) as the password (username can be your GitHub username or `git`).";
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
  if (/Failed to fetch|ENOTFOUND|network|cors|Git HTTP request failed/i.test(message)) {
    return `Network error talking to remote: ${message}`;
  }
  // Remaining bare "403 Forbidden" after FS check — likely remote ACL
  if (/^403|Forbidden|HTTP Error:\s*403/i.test(message.trim())) {
    return "Access denied by the remote. Check repository permissions and your PAT scopes (repo).";
  }
  return message || "Git operation failed";
}
