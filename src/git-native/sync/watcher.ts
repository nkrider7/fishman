import { watch, type UnwatchFn, type WatchEvent } from "@tauri-apps/plugin-fs";
import { anySelfWrite } from "./self-write";

export type WatcherEventHandler = (paths: string[]) => void;

export interface FishmanWatcher {
  stop: () => Promise<void>;
}

export interface StartFishmanWatcherOptions {
  /** Absolute path to the fishman/ workspace root. */
  workspaceRootPath: string;
  onChange: WatcherEventHandler;
  /** Debounce coalescing for bursty FS events. */
  debounceMs?: number;
  /** Optional: called once if watch fails to start. */
  onError?: (message: string) => void;
}

function eventPaths(event: WatchEvent): string[] {
  const raw = event.paths ?? [];
  return raw.map((p) => String(p).replace(/\\/g, "/"));
}

function isRelevantPath(path: string, root: string): boolean {
  const n = path.replace(/\\/g, "/");
  const r = root.replace(/\\/g, "/").replace(/\/$/, "");
  if (!n.startsWith(r)) return false;
  // Ignore secrets / history noise if nested under fishman
  if (n.includes(".secret.json") || n.includes("/history/")) return false;
  return true;
}

/**
 * Watch the fishman/ workspace recursively. Debounces and ignores self-writes.
 */
export async function startFishmanWatcher(
  options: StartFishmanWatcherOptions,
): Promise<FishmanWatcher> {
  const debounceMs = options.debounceMs ?? 400;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = new Set<string>();
  let unwatch: UnwatchFn | null = null;
  let stopped = false;

  const flush = () => {
    timer = null;
    if (stopped) return;
    const paths = [...pending];
    pending.clear();
    if (paths.length === 0) return;
    if (anySelfWrite(paths)) return;
    options.onChange(paths);
  };

  const onEvent = (event: WatchEvent) => {
    if (stopped) return;
    const paths = eventPaths(event).filter((p) =>
      isRelevantPath(p, options.workspaceRootPath),
    );
    if (paths.length === 0) return;
    if (anySelfWrite(paths)) return;
    for (const p of paths) pending.add(p);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  try {
    unwatch = await watch(options.workspaceRootPath, onEvent, {
      recursive: true,
      delayMs: 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    options.onError?.(message);
    return {
      stop: async () => {
        stopped = true;
      },
    };
  }

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      pending.clear();
      try {
        unwatch?.();
      } catch {
        // ignore
      }
      unwatch = null;
    },
  };
}

/** Exported for unit tests — relevance filter. */
export function __testIsRelevantPath(path: string, root: string): boolean {
  return isRelevantPath(path, root);
}
