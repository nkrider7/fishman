import type { FsDirEntry } from "@/scanner/core/types";

/**
 * Filesystem surface for git-native collections.
 * Extends scanner read APIs with write/mkdir/remove for sync.
 */
export interface GitNativeFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  readDir(path: string): Promise<FsDirEntry[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  join(...parts: string[]): string;
  basename(path: string): string;
  dirname(path: string): string;
  relative(from: string, to: string): string;
}

export function normalizePosix(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
