/** Pure helpers for the WebSocket feature (no React / Redux deps). */

/** True when `url` is a syntactically valid ws:// or wss:// URL. */
export function isWebSocketUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!/^wss?:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === "ws:" || parsed.protocol === "wss:") &&
      parsed.host.length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Suggest a ws/wss upgrade when a user pastes an http(s) URL into the WS bar.
 * Returns null when no rewrite applies.
 */
export function suggestWebSocketUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https:\/\//i.test(trimmed)) return trimmed.replace(/^https:\/\//i, "wss://");
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "ws://");
  return null;
}

/** Human-readable byte size for the message timeline. */
export function formatWsSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Pretty-print JSON text when parseable; otherwise return the original text.
 * Never throws.
 */
export function tryPrettyJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

/** True when `text` parses as a JSON object/array. */
export function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Validate JSON, returning an error message or null when valid. */
export function validateJson(text: string): string | null {
  if (!text.trim()) return "Message is empty";
  try {
    JSON.parse(text);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid JSON";
  }
}
