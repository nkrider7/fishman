/**
 * Tracks paths we just wrote so the file watcher can ignore echo events
 * and avoid reload loops (auto-save → watch → reload → fight).
 */

const DEFAULT_TTL_MS = 1500;

interface Entry {
  expiresAt: number;
}

const paths = new Map<string, Entry>();

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/** Mark absolute or workspace-relative paths as self-written for a short TTL. */
export function markSelfWrite(
  input: string | string[],
  ttlMs = DEFAULT_TTL_MS,
): void {
  const list = Array.isArray(input) ? input : [input];
  const expiresAt = Date.now() + ttlMs;
  for (const p of list) {
    if (!p) continue;
    paths.set(normalize(p), { expiresAt });
  }
}

export function isSelfWrite(path: string, now = Date.now()): boolean {
  const key = normalize(path);
  const entry = paths.get(key);
  if (!entry) return false;
  if (entry.expiresAt <= now) {
    paths.delete(key);
    return false;
  }
  return true;
}

/** True if any watched event path is still in the self-write window. */
export function anySelfWrite(eventPaths: string[], now = Date.now()): boolean {
  return eventPaths.some((p) => isSelfWrite(p, now));
}

/** Test helper — clear all markers. */
export function clearSelfWrites(): void {
  paths.clear();
}

/** Test helper — force expiry. */
export function pruneSelfWrites(now = Date.now()): void {
  for (const [key, entry] of paths) {
    if (entry.expiresAt <= now) paths.delete(key);
  }
}
