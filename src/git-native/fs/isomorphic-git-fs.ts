import {
  exists,
  lstat,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  rename,
  stat,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { FileInfo } from "@tauri-apps/plugin-fs";
import { enqueueTauriFs } from "./fs-queue";

type ErrWithCode = Error & { code?: string };

function ioError(code: string, message: string): ErrWithCode {
  const err = new Error(message) as ErrWithCode;
  err.code = code;
  return err;
}

function mapStat(info: FileInfo) {
  const mode = info.isDirectory ? 0o040755 : 0o100644;
  const mtimeMs =
    info.mtime != null ? new Date(info.mtime).getTime() : Date.now();
  return {
    type: info.isDirectory ? ("dir" as const) : ("file" as const),
    mode,
    size: info.size ?? 0,
    ino: 0,
    mtimeMs,
    ctimeMs: mtimeMs,
    uid: 1,
    gid: 1,
    dev: 1,
    isFile: () => Boolean(info.isFile),
    isDirectory: () => Boolean(info.isDirectory),
    isSymbolicLink: () => Boolean(info.isSymlink),
  };
}

async function wrap<T>(fn: () => Promise<T>, path: string): Promise<T> {
  return enqueueTauriFs(async () => {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not found|os error 2|No such file|ENOENT/i.test(msg)) {
        throw ioError("ENOENT", `ENOENT: ${path}`);
      }
      if (/exist|EEXIST/i.test(msg)) {
        throw ioError("EEXIST", `EEXIST: ${path}`);
      }
      throw e;
    }
  });
}

/**
 * Promise-based FS compatible with isomorphic-git, backed by Tauri plugin-fs.
 */
export function createIsomorphicGitFs() {
  const promises = {
    async readFile(
      filepath: string,
      options?: { encoding?: string } | string,
    ): Promise<Uint8Array | string> {
      const encoding =
        typeof options === "string" ? options : options?.encoding;
      return wrap(async () => {
        if (encoding === "utf8") {
          return readTextFile(filepath);
        }
        return readFile(filepath);
      }, filepath);
    },

    async writeFile(
      filepath: string,
      data: Uint8Array | string,
      _options?: unknown,
    ): Promise<void> {
      await wrap(async () => {
        if (typeof data === "string") {
          await writeTextFile(filepath, data);
          return;
        }
        await writeFile(filepath, data);
      }, filepath);
    },

    async unlink(filepath: string): Promise<void> {
      await wrap(async () => {
        await remove(filepath);
      }, filepath);
    },

    async readdir(filepath: string): Promise<string[]> {
      return wrap(async () => {
        const entries = await readDir(filepath);
        return entries.map((e) => e.name);
      }, filepath);
    },

    async mkdir(
      filepath: string,
      options?: { recursive?: boolean },
    ): Promise<void> {
      await wrap(async () => {
        await mkdir(filepath, { recursive: options?.recursive ?? false });
      }, filepath);
    },

    async rmdir(filepath: string): Promise<void> {
      await wrap(async () => {
        await remove(filepath, { recursive: false });
      }, filepath);
    },

    async stat(filepath: string) {
      return wrap(async () => mapStat(await stat(filepath)), filepath);
    },

    async lstat(filepath: string) {
      return wrap(async () => mapStat(await lstat(filepath)), filepath);
    },

    async readlink(_filepath: string): Promise<string> {
      throw ioError("EINVAL", "symlinks are not supported");
    },

    async symlink(_target: string, _filepath: string): Promise<void> {
      throw ioError("EINVAL", "symlinks are not supported");
    },

    async chmod(_filepath: string, _mode: number): Promise<void> {
      // no-op on desktop via Tauri FS
    },

    async rename(oldPath: string, newPath: string): Promise<void> {
      await wrap(async () => {
        await rename(oldPath, newPath);
      }, oldPath);
    },

    async exists(filepath: string): Promise<boolean> {
      return enqueueTauriFs(() => exists(filepath));
    },
  };

  return { promises };
}

export type IsomorphicGitFs = ReturnType<typeof createIsomorphicGitFs>;
