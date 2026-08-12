/**
 * Pure URL find/replace helpers.
 *
 * Origin mode replaces scheme://host[:port] safely (never :3000 inside :30000).
 * Literal mode does substring replace with origin-boundary safeguards.
 */

const TEMPLATE_RE = /\{\{[^}]+\}\}/;

/** Trim find/replace inputs (not mid-URL). */
export function normalizeFindReplaceInputs(find: string, replace: string): {
  find: string;
  replace: string;
} {
  return { find: find.trim(), replace: replace.trim() };
}

export function hasTemplateVars(url: string): boolean {
  return TEMPLATE_RE.test(url);
}

/**
 * Extract origin (protocol + host + port) from a URL-like string.
 * Returns null for relative paths, template-only URLs, or unparseable input.
 */
export function extractOrigin(
  raw: string,
  options?: { matchCase?: boolean },
): string | null {
  const trimmed = raw.trim();
  if (!trimmed || hasTemplateVars(trimmed)) return null;

  // Support ws/wss/http/https
  let candidate = trimmed;
  try {
    // Absolute URL
    const u = new URL(candidate);
    if (!u.protocol || !u.host) return null;
    const origin = `${u.protocol}//${u.host}`;
    return options?.matchCase === false ? origin : origin;
  } catch {
    // Maybe missing scheme — don't invent one for detection of full URLs
    return null;
  }
}

/**
 * Parse a user-provided find/replace string as an origin.
 * Accepts `http://localhost:3000` or `http://localhost:3000/` (trailing slash stripped).
 */
export function parseOriginInput(
  raw: string,
  matchCase: boolean,
): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (!u.hostname) return null;
    // Reject if user passed a path beyond "/"
    if (u.pathname && u.pathname !== "/" && u.pathname !== "") {
      // Allow only bare origin inputs in origin mode
      if (u.pathname !== "/") return null;
    }
    if (u.search || u.hash) return null;
    const origin = `${u.protocol}//${u.host}`;
    return matchCase ? origin : origin;
  } catch {
    return null;
  }
}

function originsEqual(a: string, b: string, matchCase: boolean): boolean {
  if (matchCase) return a === b;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Replace the origin of `url` when it matches `findOrigin`.
 * Preserves path, query, and hash exactly (via URL parsing + string splice of origin length).
 */
export function replaceOriginInUrl(
  url: string,
  findOrigin: string,
  replaceOrigin: string,
  matchCase: boolean,
): { next: string; matchStart: number; matchLength: number } | null {
  const trimmed = url.trim();
  if (!trimmed || hasTemplateVars(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const currentOrigin = `${parsed.protocol}//${parsed.host}`;
  if (!originsEqual(currentOrigin, findOrigin, matchCase)) return null;

  // Rebuild: replaceOrigin + everything after the original origin in the string.
  // Prefer string-prefix replace on the exact origin span inside `url` so we
  // preserve original casing/spacing outside the origin when possible.
  const originInUrl = findOriginSpan(url, currentOrigin, matchCase);
  if (!originInUrl) {
    const safeRest = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return {
      next: `${replaceOrigin}${safeRest}`,
      matchStart: 0,
      matchLength: currentOrigin.length,
    };
  }

  const next =
    url.slice(0, originInUrl.start) +
    replaceOrigin +
    url.slice(originInUrl.start + originInUrl.length);

  return {
    next,
    matchStart: originInUrl.start,
    matchLength: originInUrl.length,
  };
}

function findOriginSpan(
  url: string,
  origin: string,
  matchCase: boolean,
): { start: number; length: number } | null {
  if (matchCase) {
    const idx = url.indexOf(origin);
    if (idx < 0) return null;
    return { start: idx, length: origin.length };
  }
  const lowerUrl = url.toLowerCase();
  const lowerOrigin = origin.toLowerCase();
  const idx = lowerUrl.indexOf(lowerOrigin);
  if (idx < 0) return null;
  return { start: idx, length: origin.length };
}

/**
 * Literal substring replace with port/host boundary safeguard:
 * finding `http://localhost:3000` must not match `http://localhost:30000`.
 */
export function replaceLiteralInUrl(
  url: string,
  find: string,
  replace: string,
  matchCase: boolean,
): { next: string; matchStart: number; matchLength: number } | null {
  if (!find) return null;
  if (hasTemplateVars(url) && !hasTemplateVars(find)) {
    // Don't corrupt template URLs unless find itself targets templates
    // (env-var mode handles {{base_url}} values separately)
  }

  const hay = matchCase ? url : url.toLowerCase();
  const needle = matchCase ? find : find.toLowerCase();
  let from = 0;
  while (from <= hay.length) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) return null;
    if (isSafeLiteralMatch(url, idx, find.length)) {
      const next = url.slice(0, idx) + replace + url.slice(idx + find.length);
      return { next, matchStart: idx, matchLength: find.length };
    }
    from = idx + 1;
  }
  return null;
}

/**
 * After a candidate match, the next character must not be a digit or
 * hostname-continuing character that would extend the port/host.
 */
export function isSafeLiteralMatch(
  url: string,
  start: number,
  length: number,
): boolean {
  const end = start + length;
  if (end < url.length) {
    const next = url[end]!;
    // Port must not continue (3000 vs 30000)
    if (/[0-9]/.test(next)) return false;
    // Host continuation (localhost vs localhostx) — only when find ends mid-label
    // Allow path separators and typical URL delimiters after the match.
    if (/[a-zA-Z0-9_-]/.test(next)) {
      // If find already ends with a delimiter-ish char, allow; otherwise block host extend
      const last = url[end - 1]!;
      if (/[a-zA-Z0-9]/.test(last)) return false;
    }
  }
  return true;
}

export interface ApplyReplaceResult {
  next: string;
  matchStart: number;
  matchLength: number;
}

/**
 * Apply find→replace to a single URL string according to options.
 * Returns null when no safe match.
 */
export function applyUrlReplace(
  url: string,
  find: string,
  replace: string,
  options: {
    matchCase: boolean;
    wholeOrigin: boolean;
  },
): ApplyReplaceResult | null {
  const { find: f, replace: r } = normalizeFindReplaceInputs(find, replace);
  if (!f) return null;
  if (f === r) return null;

  if (options.wholeOrigin) {
    const findOrigin = parseOriginInput(f, true);
    const replaceOrigin = parseOriginInput(r, true);
    if (!findOrigin || !replaceOrigin) {
      const fo =
        extractOrigin(f, { matchCase: options.matchCase }) ??
        parseOriginInput(f, options.matchCase);
      const ro =
        extractOrigin(r, { matchCase: options.matchCase }) ??
        parseOriginInput(r, options.matchCase);
      if (!fo || !ro) return null;
      return replaceOriginInUrl(url, fo, ro, options.matchCase);
    }
    return replaceOriginInUrl(url, findOrigin, replaceOrigin, options.matchCase);
  }

  return replaceLiteralInUrl(url, f, r, options.matchCase);
}

/**
 * Detect whether `url` matches `find` without applying a replacement.
 * Used to scan once, then remap `after` cheaply as the user types replace.
 */
export function findUrlMatch(
  url: string,
  find: string,
  options: {
    matchCase: boolean;
    wholeOrigin: boolean;
  },
): { matchStart: number; matchLength: number } | null {
  const f = find.trim();
  if (!f) return null;

  if (options.wholeOrigin) {
    const findOrigin =
      parseOriginInput(f, true) ??
      extractOrigin(f, { matchCase: options.matchCase }) ??
      parseOriginInput(f, options.matchCase);
    if (!findOrigin) return null;
    if (hasTemplateVars(url.trim())) return null;
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return null;
    }
    const currentOrigin = `${parsed.protocol}//${parsed.host}`;
    const matchCase = options.matchCase;
    const equal = matchCase
      ? currentOrigin === findOrigin
      : currentOrigin.toLowerCase() === findOrigin.toLowerCase();
    if (!equal) return null;
    const span = findOriginSpan(url, currentOrigin, matchCase);
    if (span) return { matchStart: span.start, matchLength: span.length };
    return { matchStart: 0, matchLength: currentOrigin.length };
  }

  return findTextMatch(url, f, options.matchCase);
}

/** First literal match + total occurrence count. */
export function findTextMatch(
  text: string,
  find: string,
  matchCase: boolean,
): { matchStart: number; matchLength: number; count: number } | null {
  const f = find.trim();
  if (!f || !text) return null;
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? f : f.toLowerCase();
  let count = 0;
  let first = -1;
  let from = 0;
  while (from <= hay.length) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) break;
    if (first < 0) first = idx;
    count += 1;
    from = idx + Math.max(1, needle.length);
  }
  if (first < 0 || count === 0) return null;
  return { matchStart: first, matchLength: f.length, count };
}

/** Replace every literal occurrence of find. */
export function replaceTextAll(
  text: string,
  find: string,
  replace: string,
  matchCase: boolean,
): ApplyReplaceResult & { count: number } | null {
  const f = find.trim();
  if (!f) return null;
  const hit = findTextMatch(text, f, matchCase);
  if (!hit) return null;

  // Preserve path boundary: find `.../api/` + replace `.../v1/api` must not
  // glue into `.../v1/apicycle` — keep the trailing slash when find had one.
  const replacement = preserveTrailingSlash(f, replace);

  if (!matchCase) {
    const hay = text.toLowerCase();
    const needle = f.toLowerCase();
    let out = "";
    let last = 0;
    let from = 0;
    while (from <= hay.length) {
      const idx = hay.indexOf(needle, from);
      if (idx < 0) break;
      out += text.slice(last, idx) + replacement;
      last = idx + f.length;
      from = last;
    }
    out += text.slice(last);
    return {
      next: out,
      matchStart: hit.matchStart,
      // Keep FIND length so "before" highlights stay accurate
      matchLength: hit.matchLength,
      count: hit.count,
    };
  }
  const next = text.split(f).join(replacement);
  return {
    next,
    matchStart: hit.matchStart,
    matchLength: hit.matchLength,
    count: hit.count,
  };
}

/**
 * If find ends with `/` and replace does not, append `/` so path segments
 * after the match stay separated (…/api/ + cycle → …/api/cycle, not …/apicycle).
 */
export function preserveTrailingSlash(find: string, replace: string): string {
  const f = find.trimEnd();
  const r = replace.trimEnd();
  if (f.endsWith("/") && r.length > 0 && !r.endsWith("/")) {
    return `${r}/`;
  }
  return replace;
}

/**
 * Field-aware apply: bare-origin URL mode when enabled; otherwise literal
 * (with trailing-slash path safety). Find strings that include a path
 * (e.g. `http://host/api/`) never use origin-only mode — that would drop `/v1`.
 */
export function applyFieldReplace(
  text: string,
  find: string,
  replace: string,
  field: "url" | "body" | "param" | "folder-base" | "env-var" | "open-tab",
  options: { matchCase: boolean; wholeOrigin: boolean },
): (ApplyReplaceResult & { count: number }) | null {
  const { find: f, replace: r } = normalizeFindReplaceInputs(find, replace);
  if (!f) return null;
  if (f === r) return null;

  const useOrigin =
    options.wholeOrigin &&
    (field === "url" || field === "folder-base" || field === "open-tab") &&
    // Only bare origins — path prefixes like /api or /v1/api must be literal
    parseOriginInput(f, true) !== null &&
    parseOriginInput(r, true) !== null;

  if (useOrigin) {
    const one = applyUrlReplace(text, f, r, {
      matchCase: options.matchCase,
      wholeOrigin: true,
    });
    if (!one) return null;
    return { ...one, count: 1 };
  }

  return replaceTextAll(text, f, r, options.matchCase);
}

export function summarizeMatches(
  matches: Array<{ kind: string; field?: string; selected: boolean }>,
): {
  total: number;
  selected: number;
  urls: number;
  bodies: number;
  params: number;
  folders: number;
  envVars: number;
  openTabs: number;
} {
  let selected = 0;
  let urls = 0;
  let bodies = 0;
  let params = 0;
  let folders = 0;
  let envVars = 0;
  let openTabs = 0;
  for (const m of matches) {
    if (m.selected) selected += 1;
    const field = m.field ?? (m.kind === "request" || m.kind === "websocket" || m.kind === "request-url" ? "url" : "");
    if (
      field === "url" ||
      m.kind === "request-url" ||
      m.kind === "websocket"
    ) {
      urls += 1;
    } else if (field === "body" || m.kind === "request-body") {
      bodies += 1;
    } else if (field === "param" || m.kind === "request-param") {
      params += 1;
    } else if (m.kind === "folder-base" || field === "folder-base") {
      folders += 1;
    } else if (m.kind === "env-var" || field === "env-var") {
      envVars += 1;
    } else if (m.kind === "open-tab" || field === "open-tab") {
      openTabs += 1;
    }
  }
  return {
    total: matches.length,
    selected,
    urls,
    bodies,
    params,
    folders,
    envVars,
    openTabs,
  };
}
