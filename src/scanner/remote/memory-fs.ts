import type { FileSystemAdapter, FsDirEntry } from "../core/types";

const ROOT = "/repo";

/**
 * In-memory FileSystemAdapter for remote GitHub scans.
 * Virtual project root is always `/repo`.
 */
export function createScannerMemoryFs(
  files: Record<string, string> = {},
): FileSystemAdapter & { root: string; dump(): Record<string, string> } {
  const store = new Map<string, string>();

  for (const [path, content] of Object.entries(files)) {
    store.set(normalizePath(path), content);
  }

  function normalizePath(path: string): string {
    let p = path.replace(/\\/g, "/");
    if (!p.startsWith("/")) p = `/${p}`;
    // Map bare paths into /repo/...
    if (p === "/") return ROOT;
    if (!p.startsWith(`${ROOT}/`) && p !== ROOT) {
      p = `${ROOT}${p.startsWith("/") ? p : `/${p}`}`;
    }
    p = p.replace(/\/{2,}/g, "/");
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  }

  function listDir(dir: string): FsDirEntry[] {
    const prefix = dir === ROOT ? `${ROOT}/` : `${dir}/`;
    const children = new Map<string, boolean>();

    for (const filePath of store.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const segment = rest.split("/")[0];
      if (!segment) continue;
      const isDirectory = rest.includes("/");
      if (!children.has(segment) || isDirectory) {
        children.set(segment, isDirectory || (children.get(segment) ?? false));
        if (isDirectory) children.set(segment, true);
      }
    }

    return Array.from(children.entries()).map(([name, isDirectory]) => ({
      name,
      isDirectory,
    }));
  }

  return {
    root: ROOT,
    dump() {
      return Object.fromEntries(store.entries());
    },
    async readFile(path: string) {
      const key = normalizePath(path);
      const content = store.get(key);
      if (content === undefined) throw new Error(`ENOENT: ${key}`);
      return content;
    },
    async readDir(path: string): Promise<FsDirEntry[]> {
      const key = normalizePath(path);
      if (key !== ROOT && !storeKeysUnder(store, key)) {
        throw new Error(`ENOENT: ${key}`);
      }
      return listDir(key);
    },
    async exists(path: string) {
      const key = normalizePath(path);
      if (store.has(key)) return true;
      if (key === ROOT) return true;
      return storeKeysUnder(store, key);
    },
    join(...parts: string[]) {
      const joined = parts
        .filter((p) => p != null && String(p).length > 0)
        .join("/")
        .replace(/\/{2,}/g, "/");
      return normalizePath(joined.startsWith("/") ? joined : `${ROOT}/${joined}`);
    },
    basename(path: string) {
      const key = normalizePath(path);
      const parts = key.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? key;
    },
    relative(from: string, to: string) {
      const fromParts = normalizePath(from).split("/").filter(Boolean);
      const toParts = normalizePath(to).split("/").filter(Boolean);
      let i = 0;
      while (
        i < fromParts.length &&
        i < toParts.length &&
        fromParts[i] === toParts[i]
      ) {
        i++;
      }
      return [
        ...Array(fromParts.length - i).fill(".."),
        ...toParts.slice(i),
      ].join("/");
    },
  };
}

function storeKeysUnder(store: Map<string, string>, dir: string): boolean {
  const prefix = `${dir}/`;
  for (const key of store.keys()) {
    if (key === dir || key.startsWith(prefix)) return true;
  }
  return false;
}

export function memoryFsFromEntries(
  entries: Array<{ path: string; content: string }>,
): ReturnType<typeof createScannerMemoryFs> {
  const files: Record<string, string> = {};
  for (const entry of entries) {
    const rel = entry.path.replace(/^\/+/, "");
    files[`/repo/${rel}`] = entry.content;
  }
  return createScannerMemoryFs(files);
}
