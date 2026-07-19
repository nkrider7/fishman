/** Parse a request URL into display domain + path (tolerates unresolved `{{vars}}`). */
export function parseUrlParts(url: string): { domain: string; path: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { domain: "", path: "/" };
  }

  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    const path = `${parsed.pathname || "/"}${parsed.search}${parsed.hash}`;
    return {
      domain: parsed.host || parsed.hostname || "",
      path,
    };
  } catch {
    const withoutScheme = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
    const slash = withoutScheme.indexOf("/");
    if (slash < 0) {
      return { domain: withoutScheme, path: "/" };
    }
    return {
      domain: withoutScheme.slice(0, slash),
      path: withoutScheme.slice(slash) || "/",
    };
  }
}

export function formatNetworkTime(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

export function formatDurationMs(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatSizeBytes(bytes: number | null): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
