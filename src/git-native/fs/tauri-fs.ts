import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { FsDirEntry } from "@/scanner/core/types";
import { enqueueTauriFs } from "./fs-queue";
import type { GitNativeFs } from "./types";
import { normalizePosix } from "./types";

function splitParts(path: string): string[] {
  return normalizePosix(path).split("/").filter(Boolean);
}

/**
 * GitNativeFs backed by Tauri plugin-fs (absolute OS paths).
 * All IPC goes through the shared FS queue (see fs-queue.ts).
 */
export function createTauriGitNativeFs(): GitNativeFs {
  return {
    async readFile(path) {
      return enqueueTauriFs(() => readTextFile(path));
    },
    async writeFile(path, contents) {
      await enqueueTauriFs(() => writeTextFile(path, contents));
    },
    async readDir(path): Promise<FsDirEntry[]> {
      return enqueueTauriFs(async () => {
        const entries = await readDir(path);
        return entries.map((entry) => ({
          name: entry.name,
          isDirectory: Boolean(entry.isDirectory),
        }));
      });
    },
    async exists(path) {
      return enqueueTauriFs(() => exists(path));
    },
    async mkdir(path, options) {
      await enqueueTauriFs(() =>
        mkdir(path, { recursive: options?.recursive ?? false }),
      );
    },
    async remove(path, options) {
      await enqueueTauriFs(() =>
        remove(path, { recursive: options?.recursive ?? false }),
      );
    },
    async rename(from, to) {
      await enqueueTauriFs(() => rename(from, to));
    },
    join(...parts) {
      const filtered = parts.filter((p) => p != null && p !== "");
      if (filtered.length === 0) return "";
      const first = filtered[0]!;
      const isAbs =
        first.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(first) ||
        first.startsWith("\\\\");
      const joined = filtered
        .map((p, i) => {
          const n = normalizePosix(p);
          if (i === 0) return n.replace(/\/$/, "");
          return n.replace(/^\//, "").replace(/\/$/, "");
        })
        .filter(Boolean)
        .join("/");
      if (isAbs && !joined.startsWith("/") && !/^[A-Za-z]:/.test(joined)) {
        return `/${joined}`;
      }
      return joined;
    },
    basename(path) {
      const parts = splitParts(path);
      return parts[parts.length - 1] ?? "";
    },
    dirname(path) {
      const n = normalizePosix(path);
      const idx = n.lastIndexOf("/");
      if (idx <= 0) {
        if (/^[A-Za-z]:$/.test(n)) return n;
        return n.startsWith("/") ? "/" : "";
      }
      const dir = n.slice(0, idx);
      return /^[A-Za-z]:$/.test(dir) ? `${dir}/` : dir;
    },
    relative(from, to) {
      const fromParts = splitParts(from);
      const toParts = splitParts(to);
      let i = 0;
      while (
        i < fromParts.length &&
        i < toParts.length &&
        fromParts[i] === toParts[i]
      ) {
        i++;
      }
      const up = fromParts.length - i;
      const rel = [...Array(up).fill(".."), ...toParts.slice(i)];
      return rel.join("/") || ".";
    },
  };
}
