import { readDir, readTextFile, exists } from "@tauri-apps/plugin-fs";
import { join, basename } from "@tauri-apps/api/path";
import type { FileSystemAdapter, FsDirEntry } from "../core/types";

export function createTauriFileSystem(): FileSystemAdapter {
  return {
    async readFile(path: string) {
      return readTextFile(path);
    },
    async readDir(path: string): Promise<FsDirEntry[]> {
      const entries = await readDir(path);
      return entries.map((entry) =>
        typeof entry === "string"
          ? { name: entry, isDirectory: true }
          : {
              name: entry.name,
              isDirectory: entry.isDirectory,
            },
      );
    },
    async exists(path: string) {
      return exists(path);
    },
    join(...parts: string[]) {
      return join(...parts);
    },
    basename(path: string) {
      return basename(path);
    },
    relative(from: string, to: string) {
      const fromParts = from.replace(/\\/g, "/").split("/").filter(Boolean);
      const toParts = to.replace(/\\/g, "/").split("/").filter(Boolean);
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
