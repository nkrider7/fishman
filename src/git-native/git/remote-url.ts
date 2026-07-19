/**
 * Normalize remote URLs for isomorphic-git (HTTPS smart HTTP).
 * SSH URLs cannot use the browser/Tauri HTTP transport.
 */
export function normalizeRemoteUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;

  // git@github.com:owner/repo.git → https://github.com/owner/repo.git
  const scp = /^git@([^:]+):(.+)$/i.exec(url);
  if (scp) {
    const host = scp[1]!;
    let path = scp[2]!;
    if (!path.endsWith(".git")) path = `${path}.git`;
    return `https://${host}/${path}`;
  }

  // ssh://git@github.com/owner/repo.git
  if (/^ssh:\/\//i.test(url)) {
    url = url.replace(/^ssh:\/\//i, "https://").replace(/^https:\/\/git@/i, "https://");
  }

  // github.com/owner/repo → https://github.com/owner/repo.git
  if (!/^https?:\/\//i.test(url) && /^[\w.-]+\.[a-z]{2,}\//i.test(url)) {
    url = `https://${url}`;
  }

  if (/^https?:\/\//i.test(url) && !url.endsWith(".git") && !url.endsWith("/")) {
    // Keep as-is if it already has a path; GitHub accepts both
  }

  return url;
}

export function isLikelySshRemote(url: string): boolean {
  const u = url.trim();
  return /^git@/i.test(u) || /^ssh:\/\//i.test(u);
}
