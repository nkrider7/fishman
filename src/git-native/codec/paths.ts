import { GitNativeError } from "../errors";
import { normalizePosix } from "../fs/types";

/**
 * Resolve `relativePath` under `rootPath`, rejecting path escapes.
 * Returns a normalized absolute-style path using the FS join semantics
 * (POSIX for memory FS; platform paths when used with Tauri).
 */
export function resolveUnderRoot(
  rootPath: string,
  relativePath: string,
  join: (...parts: string[]) => string,
): string {
  const root = normalizePosix(rootPath).replace(/\/$/, "");
  const rel = normalizePosix(relativePath);

  if (rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) {
    throw new GitNativeError(
      "PATH_ESCAPE",
      `Absolute paths are not allowed: ${relativePath}`,
      { path: relativePath },
    );
  }

  const parts = rel.split("/").filter((p) => p.length > 0);
  for (const part of parts) {
    if (part === "..") {
      throw new GitNativeError(
        "PATH_ESCAPE",
        `Path escapes collection root: ${relativePath}`,
        { path: relativePath },
      );
    }
  }

  const resolved = join(root, ...parts);
  const resolvedNorm = normalizePosix(resolved);
  const rootNorm = normalizePosix(root);

  if (
    resolvedNorm !== rootNorm &&
    !resolvedNorm.startsWith(`${rootNorm}/`)
  ) {
    throw new GitNativeError(
      "PATH_ESCAPE",
      `Path escapes collection root: ${relativePath}`,
      { path: relativePath },
    );
  }

  return resolved;
}

/** Convert an absolute path back to a root-relative POSIX path. */
export function toRelativePath(rootPath: string, absolutePath: string): string {
  const root = normalizePosix(rootPath).replace(/\/$/, "");
  const abs = normalizePosix(absolutePath);
  if (abs === root) return "";
  if (abs.startsWith(`${root}/`)) {
    return abs.slice(root.length + 1);
  }
  throw new GitNativeError(
    "PATH_ESCAPE",
    `Path is outside collection root: ${absolutePath}`,
    { path: absolutePath },
  );
}
