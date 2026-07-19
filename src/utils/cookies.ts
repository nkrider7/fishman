import type { CookieInput, CookieSameSite, StoredCookie } from "@/types/cookie";

export interface ParsedSetCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string | null;
  maxAge?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: CookieSameSite | null;
}

function stripQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseExpiresDate(raw: string): string | null {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Parse a single Set-Cookie header value into attributes.
 * Does not handle cookie-pair encoding beyond basic trim/quotes.
 */
export function parseSetCookieHeader(
  header: string,
  requestUrl: string,
): ParsedSetCookie | null {
  const parts = header.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const [nameValue, ...attrs] = parts;
  const eq = nameValue.indexOf("=");
  if (eq <= 0) return null;

  const name = nameValue.slice(0, eq).trim();
  const value = stripQuotes(nameValue.slice(eq + 1).trim());
  if (!name) return null;

  let domain: string | undefined;
  let path: string | undefined;
  let expires: string | null | undefined;
  let maxAge: number | undefined;
  let secure = false;
  let httpOnly = false;
  let sameSite: CookieSameSite | null = null;

  for (const attr of attrs) {
    const attrEq = attr.indexOf("=");
    const key = (attrEq === -1 ? attr : attr.slice(0, attrEq)).trim().toLowerCase();
    const rawVal = attrEq === -1 ? "" : stripQuotes(attr.slice(attrEq + 1).trim());

    switch (key) {
      case "domain":
        domain = rawVal.replace(/^\./, "").toLowerCase();
        if (domain) domain = `.${domain}`;
        break;
      case "path":
        path = rawVal || "/";
        break;
      case "expires":
        expires = parseExpiresDate(rawVal);
        break;
      case "max-age": {
        const seconds = Number.parseInt(rawVal, 10);
        if (!Number.isNaN(seconds)) maxAge = seconds;
        break;
      }
      case "secure":
        secure = true;
        break;
      case "httponly":
        httpOnly = true;
        break;
      case "samesite": {
        const normalized = rawVal.toLowerCase();
        if (normalized === "strict") sameSite = "Strict";
        else if (normalized === "lax") sameSite = "Lax";
        else if (normalized === "none") sameSite = "None";
        break;
      }
      default:
        break;
    }
  }

  if (maxAge !== undefined) {
    if (maxAge <= 0) {
      expires = new Date(0).toISOString();
    } else {
      expires = new Date(Date.now() + maxAge * 1000).toISOString();
    }
  }

  let requestHost = "";
  let defaultPath = "/";
  try {
    const url = new URL(requestUrl);
    requestHost = url.hostname.toLowerCase();
    defaultPath = defaultCookiePath(url.pathname);
  } catch {
    // leave defaults
  }

  if (!domain) {
    domain = requestHost;
  }

  return {
    name,
    value,
    domain,
    path: path ?? defaultPath,
    expires: expires === undefined ? null : expires,
    maxAge,
    secure,
    httpOnly,
    sameSite,
  };
}

/** RFC 6265 default-path algorithm (simplified). */
export function defaultCookiePath(pathname: string): string {
  if (!pathname || !pathname.startsWith("/") || pathname === "/") return "/";
  const lastSlash = pathname.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return pathname.slice(0, lastSlash) || "/";
}

export function isCookieExpired(
  cookie: Pick<StoredCookie, "expires">,
  now = Date.now(),
): boolean {
  if (!cookie.expires) return false;
  const ts = Date.parse(cookie.expires);
  if (Number.isNaN(ts)) return false;
  return ts <= now;
}

/**
 * Domain-match per RFC 6265 (host-only vs domain cookies).
 * Leading-dot domains match the domain and all subdomains.
 */
export function domainMatches(cookieDomain: string, requestHost: string): boolean {
  const host = requestHost.toLowerCase();
  const domain = cookieDomain.toLowerCase();

  if (domain.startsWith(".")) {
    const suffix = domain.slice(1);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  return host === domain;
}

/** Path-match per RFC 6265. */
export function pathMatches(cookiePath: string, requestPath: string): boolean {
  const path = cookiePath || "/";
  const req = requestPath || "/";

  if (req === path) return true;
  if (!req.startsWith(path)) return false;
  if (path.endsWith("/")) return true;
  return req.charAt(path.length) === "/";
}

export function cookieMatchesUrl(
  cookie: Pick<StoredCookie, "domain" | "path" | "secure" | "expires">,
  requestUrl: string,
  now = Date.now(),
): boolean {
  if (isCookieExpired(cookie, now)) return false;

  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return false;
  }

  if (cookie.secure && url.protocol !== "https:") return false;
  if (!domainMatches(cookie.domain, url.hostname)) return false;
  if (!pathMatches(cookie.path, url.pathname || "/")) return false;
  return true;
}

export function selectCookiesForUrl(
  cookies: StoredCookie[],
  requestUrl: string,
  now = Date.now(),
): StoredCookie[] {
  const matched = cookies.filter((c) => cookieMatchesUrl(c, requestUrl, now));

  // Prefer more-specific path, then longer domain (RFC-ish ordering for Cookie header).
  return matched.sort((a, b) => {
    if (b.path.length !== a.path.length) return b.path.length - a.path.length;
    return b.domain.length - a.domain.length;
  });
}

export function buildCookieHeader(cookies: StoredCookie[]): string {
  // Deduplicate by name — first (most specific) wins.
  const seen = new Set<string>();
  const pairs: string[] = [];
  for (const cookie of cookies) {
    if (seen.has(cookie.name)) continue;
    seen.add(cookie.name);
    pairs.push(`${cookie.name}=${cookie.value}`);
  }
  return pairs.join("; ");
}

export function cookiesToNameMap(cookies: StoredCookie[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cookie of cookies) {
    if (!(cookie.name in map)) map[cookie.name] = cookie.value;
  }
  return map;
}

export function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return "";
  // Keep leading dot if user provided it for subdomain matching.
  if (trimmed.startsWith(".")) return trimmed;
  return trimmed;
}

export function createStoredCookie(input: CookieInput, existingId?: string): StoredCookie {
  const now = new Date().toISOString();
  return {
    id: existingId ?? input.id ?? crypto.randomUUID(),
    domain: normalizeDomain(input.domain),
    name: input.name.trim(),
    value: input.value,
    path: input.path?.trim() || "/",
    expires: input.expires === undefined ? null : input.expires,
    secure: input.secure ?? false,
    httpOnly: input.httpOnly ?? false,
    sameSite: input.sameSite ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function parsedToCookieInput(
  parsed: ParsedSetCookie,
  existing?: StoredCookie,
): CookieInput {
  return {
    id: existing?.id,
    domain: parsed.domain ?? "",
    name: parsed.name,
    value: parsed.value,
    path: parsed.path ?? "/",
    expires: parsed.expires ?? null,
    secure: parsed.secure,
    httpOnly: parsed.httpOnly,
    sameSite: parsed.sameSite,
  };
}

export function groupCookiesByDomain(
  cookies: StoredCookie[],
): Array<{ domain: string; cookies: StoredCookie[] }> {
  const map = new Map<string, StoredCookie[]>();
  for (const cookie of cookies) {
    const key = cookie.domain;
    const list = map.get(key);
    if (list) list.push(cookie);
    else map.set(key, [cookie]);
  }

  return [...map.entries()]
    .map(([domain, list]) => ({
      domain,
      cookies: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

export function formatCookieExpires(expires: string | null): string {
  if (!expires) return "Session";
  const date = new Date(expires);
  if (Number.isNaN(date.getTime())) return "Session";
  return date.toLocaleString();
}
