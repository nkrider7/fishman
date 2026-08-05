import type { FileSystemAdapter } from "../core/types";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".gradle",
  ".idea",
  ".vscode",
  "out",
  "bin",
  "coverage",
  ".turbo",
  ".cache",
  "vendor",
  "__pycache__",
]);

const RUST_EXTENSIONS = new Set([".rs"]);

const ROUTE_HINTS = [
  "routes",
  "route",
  "handlers",
  "handler",
  "api",
  "apis",
  "controllers",
  "controller",
  "server",
  "main",
  "lib",
];

export interface DiscoveredRustFile {
  absolutePath: string;
  relativePath: string;
  priority: number;
  isMainSource: boolean;
}

export async function discoverRustFiles(
  fs: FileSystemAdapter,
  projectPath: string,
  options?: {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxFiles?: number;
  },
): Promise<DiscoveredRustFile[]> {
  const files: DiscoveredRustFile[] = [];
  const maxFiles = options?.maxFiles ?? 5000;

  async function walk(dir: string, depth = 0): Promise<void> {
    if (files.length >= maxFiles || depth > 18) return;

    let entries: import("../core/types").FsDirEntry[];
    try {
      entries = await fs.readDir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const fullPath = await fs.join(dir, entry.name);

      if (DEFAULT_IGNORE.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (options?.excludePatterns?.some((p) => fullPath.includes(p))) continue;

      const norm = fullPath.replace(/\\/g, "/");
      if (/\/tests?\//.test(norm) || /\/benches?\//.test(norm)) continue;

      if (entry.isDirectory) {
        await walk(fullPath, depth + 1);
        continue;
      }

      const ext = entry.name.includes(".")
        ? entry.name.slice(entry.name.lastIndexOf("."))
        : "";
      if (!RUST_EXTENSIONS.has(ext)) continue;
      if (options?.includePatterns?.length) {
        if (!options.includePatterns.some((p) => fullPath.includes(p))) continue;
      }

      const relativePath = fs.relative(projectPath, fullPath).replace(/\\/g, "/");
      const isMainSource = relativePath.startsWith("src/");
      const priority = scoreRustFile(relativePath, entry.name, isMainSource);
      files.push({ absolutePath: fullPath, relativePath, priority, isMainSource });
    }
  }

  await walk(projectPath);
  files.sort((a, b) => b.priority - a.priority);
  return files;
}

function scoreRustFile(
  relativePath: string,
  basename: string,
  isMainSource: boolean,
): number {
  let score = 0;
  const lower = relativePath.toLowerCase();
  const baseLower = basename.toLowerCase();

  if (isMainSource) score += 40;
  if (baseLower === "main.rs" || baseLower === "lib.rs") score += 25;
  if (baseLower.includes("route") || baseLower.includes("handler")) score += 30;
  if (baseLower.includes("controller") || baseLower.includes("api")) score += 20;

  for (const hint of ROUTE_HINTS) {
    if (lower.includes(`/${hint}/`) || lower.includes(`/${hint}.rs`)) {
      score += 10;
    }
  }

  return score;
}
