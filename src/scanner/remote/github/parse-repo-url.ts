export interface GitHubRepoRef {
  host: "github.com";
  owner: string;
  repo: string;
  ref?: string;
  subpath?: string;
}

/**
 * Parse GitHub HTTPS, SSH, tree URLs, or `owner/repo` shorthand.
 */
export function parseGitHubRepoUrl(input: string): GitHubRepoRef {
  const raw = input.trim();
  if (!raw) {
    throw new GitHubUrlError("Enter a GitHub repository URL.");
  }

  // owner/repo shorthand
  const short = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (short && !raw.includes(":") && !raw.includes("http")) {
    return {
      host: "github.com",
      owner: short[1],
      repo: stripGitSuffix(short[2]),
    };
  }

  // git@github.com:owner/repo.git
  const ssh = raw.match(
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i,
  );
  if (ssh) {
    return {
      host: "github.com",
      owner: ssh[1],
      repo: stripGitSuffix(ssh[2]),
    };
  }

  // ssh://git@github.com/owner/repo.git
  const sshUrl = raw.match(
    /^ssh:\/\/git@github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i,
  );
  if (sshUrl) {
    return {
      host: "github.com",
      owner: sshUrl[1],
      repo: stripGitSuffix(sshUrl[2]),
    };
  }

  let url: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    url = new URL(withProtocol);
  } catch {
    throw new GitHubUrlError(
      "Invalid GitHub URL. Example: https://github.com/owner/repo",
    );
  }

  if (!/^(www\.)?github\.com$/i.test(url.hostname)) {
    throw new GitHubUrlError("Only github.com repositories are supported for now.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new GitHubUrlError("URL must include owner and repository name.");
  }

  const owner = parts[0];
  const repo = stripGitSuffix(parts[1]);
  let ref: string | undefined;
  let subpath: string | undefined;

  // /owner/repo/tree/<ref>/optional/subpath
  // /owner/repo/blob/<ref>/path
  if (parts.length >= 4 && (parts[2] === "tree" || parts[2] === "blob")) {
    ref = decodeURIComponent(parts[3]);
    if (parts.length > 4) {
      subpath = parts.slice(4).map(decodeURIComponent).join("/");
    }
  }

  return { host: "github.com", owner, repo, ref, subpath };
}

export function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/i, "");
}

export function formatGitHubRepoLabel(ref: GitHubRepoRef): string {
  const base = `${ref.owner}/${ref.repo}`;
  if (ref.ref && ref.subpath) return `${base}@${ref.ref}/${ref.subpath}`;
  if (ref.ref) return `${base}@${ref.ref}`;
  return base;
}

export class GitHubUrlError extends Error {
  readonly code = "InvalidGitHubUrl" as const;
  constructor(message: string) {
    super(message);
    this.name = "GitHubUrlError";
  }
}
