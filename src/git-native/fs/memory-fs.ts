import type { FsDirEntry } from "@/scanner/core/types";
import type { GitNativeFs } from "./types";
import { normalizePosix } from "./types";

export interface MemoryFs extends GitNativeFs {
  /** All file paths → contents (for tests). */
  dump(): Record<string, string>;
}

/**
 * In-memory FS for codec tests. Paths use POSIX `/` separators (no leading slash).
 */
export function createMemoryFs(
  initial: Record<string, string> = {},
): MemoryFs {
  const files = new Map<string, string>();
  const dirs = new Set<string>([""]);

  function norm(path: string): string {
    return normalizePosix(path).replace(/^\//, "").replace(/\/$/, "");
  }

  function trackParents(filePath: string) {
    const parts = norm(filePath).split("/").filter(Boolean);
    let cur = "";
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur ? `${cur}/${parts[i]}` : parts[i];
      dirs.add(cur);
    }
  }

  for (const [path, content] of Object.entries(initial)) {
    const n = norm(path);
    trackParents(n);
    files.set(n, content);
  }

  function listImmediateChildren(dir: string): FsDirEntry[] {
    const prefix = dir ? `${dir}/` : "";
    const children = new Map<string, boolean>();

    for (const d of dirs) {
      if (!d) continue;
      if (!dir) {
        const slash = d.indexOf("/");
        const child = slash === -1 ? d : d.slice(0, slash);
        if (child) children.set(child, true);
        continue;
      }
      if (d === dir) continue;
      if (!d.startsWith(prefix)) continue;
      const rest = d.slice(prefix.length);
      const slash = rest.indexOf("/");
      const child = slash === -1 ? rest : rest.slice(0, slash);
      if (child) children.set(child, true);
    }

    for (const filePath of files.keys()) {
      if (dir && !filePath.startsWith(prefix)) continue;
      if (!dir && filePath.includes("/")) {
        children.set(filePath.slice(0, filePath.indexOf("/")), true);
        continue;
      }
      if (!dir) {
        children.set(filePath, false);
        continue;
      }
      const rest = filePath.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) children.set(rest, false);
      else children.set(rest.slice(0, slash), true);
    }

    return [...children.entries()]
      .filter(([name]) => name.length > 0)
      .map(([name, isDirectory]) => ({ name, isDirectory }));
  }

  function dirExists(dir: string): boolean {
    if (dir === "" || dirs.has(dir)) return true;
    const prefix = `${dir}/`;
    for (const filePath of files.keys()) {
      if (filePath === dir || filePath.startsWith(prefix)) return true;
    }
    for (const d of dirs) {
      if (d === dir || d.startsWith(prefix)) return true;
    }
    return false;
  }

  const api: MemoryFs = {
    dump() {
      return Object.fromEntries(files.entries());
    },
    async readFile(path) {
      const n = norm(path);
      const content = files.get(n);
      if (content === undefined) {
        throw new Error(`ENOENT: ${n}`);
      }
      return content;
    },
    async writeFile(path, contents) {
      const n = norm(path);
      trackParents(n);
      files.set(n, contents);
    },
    async readDir(path) {
      const n = norm(path);
      if (n && !dirExists(n) && !files.has(n)) {
        throw new Error(`ENOENT: ${n}`);
      }
      return listImmediateChildren(n);
    },
    async exists(path) {
      const n = norm(path);
      if (n === "") return true;
      if (files.has(n)) return true;
      return dirExists(n);
    },
    async mkdir(path, options) {
      const n = norm(path);
      if (!n) return;
      if (options?.recursive) {
        const parts = n.split("/");
        let cur = "";
        for (const part of parts) {
          cur = cur ? `${cur}/${part}` : part;
          dirs.add(cur);
        }
      } else {
        dirs.add(n);
      }
    },
    async remove(path, options) {
      const n = norm(path);
      if (files.has(n)) {
        files.delete(n);
        return;
      }
      if (options?.recursive) {
        for (const file of [...files.keys()]) {
          if (file === n || file.startsWith(`${n}/`)) files.delete(file);
        }
        for (const d of [...dirs]) {
          if (d === n || d.startsWith(`${n}/`)) dirs.delete(d);
        }
      } else {
        dirs.delete(n);
      }
    },
    async rename(from, to) {
      const a = norm(from);
      const b = norm(to);
      if (!files.has(a)) {
        throw new Error(`ENOENT rename: ${a}`);
      }
      const content = files.get(a)!;
      files.delete(a);
      trackParents(b);
      files.set(b, content);
    },
    join(...parts) {
      return norm(parts.filter(Boolean).join("/"));
    },
    basename(path) {
      const parts = norm(path).split("/").filter(Boolean);
      return parts[parts.length - 1] ?? "";
    },
    dirname(path) {
      const n = norm(path);
      const idx = n.lastIndexOf("/");
      if (idx === -1) return "";
      return n.slice(0, idx);
    },
    relative(from, to) {
      const fromParts = norm(from).split("/").filter(Boolean);
      const toParts = norm(to).split("/").filter(Boolean);
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

  return api;
}
