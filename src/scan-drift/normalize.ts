/**
 * Normalize API paths for Scan Drift identity matching.
 * Strips host / {{vars}} prefixes when extracting from full URLs.
 */

const PATH_PARAM_PATTERNS: Array<[RegExp, string]> = [
  // FastAPI / Flask / Angle brackets <id> or <int:id> (before :id — avoids eating inside <…>)
  [/<(?:(?:int|str|uuid|path|float|slug):)?([A-Za-z_][\w]*)>/gi, "{$1}"],
  // Express / Koa style :id
  [/:([A-Za-z_][\w]*)/g, "{$1}"],
];

/** Extract pathname from a request URL that may include scheme, host, or {{baseUrl}}. */
export function extractPathFromUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return "/";

  // {{baseUrl}}/users or {{ base_url }}/api/v1/users
  const varPrefix = trimmed.match(/^(\{\{[^}]+\}\})(\/.*)?$/);
  if (varPrefix) {
    return normalizePath(varPrefix[2] || "/");
  }

  // Absolute URL
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return normalizePath(u.pathname || "/");
    } catch {
      // fall through
    }
  }

  // Protocol-relative or path-only — drop query/hash
  const withoutQuery = trimmed.split(/[?#]/)[0] ?? trimmed;
  // If it looks like host/path without scheme (localhost:3000/users), take from first /
  if (!withoutQuery.startsWith("/") && withoutQuery.includes("/")) {
    const idx = withoutQuery.indexOf("/");
    return normalizePath(withoutQuery.slice(idx));
  }

  return normalizePath(withoutQuery);
}

/** Canonical path for scanKey matching. */
export function normalizePath(path: string): string {
  let p = (path ?? "").trim();
  if (!p) return "/";

  // Drop query/hash if present
  p = p.split(/[?#]/)[0] ?? p;

  if (!p.startsWith("/")) p = `/${p}`;

  // Collapse duplicate slashes
  p = p.replace(/\/{2,}/g, "/");

  // Strip trailing slash except root
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }

  // Normalize path params to {name}
  for (const [re, replacement] of PATH_PARAM_PATTERNS) {
    p = p.replace(re, replacement);
  }

  // Lowercase only the braces content? Keep param names as-is but collapse {Id} vs {id} optionally.
  // Keep case of static segments; normalize param token casing for stability:
  p = p.replace(/\{([^}]+)\}/g, (_, name: string) => `{${name.toLowerCase()}}`);

  return p || "/";
}

export function normalizeMethod(method: string): string {
  return (method ?? "GET").trim().toUpperCase();
}
