import type { FileSystemAdapter } from "../core/types";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "vendor",
  "bin",
  "target",
  ".idea",
  ".vscode",
  "coverage",
  "__pycache__",
  "testdata",
]);

const GO_EXTENSIONS = new Set([".go"]);

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
  "cmd",
  "internal",
  "main",
];

export interface DiscoveredGoFile {
  absolutePath: string;
  relativePath: string;
  priority: number;
}

export async function discoverGoFiles(
  fs: FileSystemAdapter,
  projectPath: string,
  options?: {
    maxFiles?: number;
    excludePatterns?: string[];
  },
): Promise<DiscoveredGoFile[]> {
  const files: DiscoveredGoFile[] = [];
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
      if (/\/testdata\//.test(norm)) continue;
      // Skip generated mocks lightly
      if (entry.name.endsWith("_test.go") && depth > 0) {
        // still allow _test.go if it has routes? skip for speed
        continue;
      }

      if (entry.isDirectory) {
        await walk(fullPath, depth + 1);
        continue;
      }

      const ext = entry.name.includes(".")
        ? entry.name.slice(entry.name.lastIndexOf("."))
        : "";
      if (!GO_EXTENSIONS.has(ext)) continue;

      const relativePath = fs.relative(projectPath, fullPath).replace(/\\/g, "/");
      files.push({
        absolutePath: fullPath,
        relativePath,
        priority: scoreGoFile(relativePath, entry.name),
      });
    }
  }

  await walk(projectPath);
  files.sort((a, b) => b.priority - a.priority);
  return files;
}

function scoreGoFile(relativePath: string, basename: string): number {
  let score = 0;
  const lower = relativePath.toLowerCase();
  const baseLower = basename.toLowerCase();

  if (baseLower === "main.go") score += 40;
  if (baseLower.includes("route") || baseLower.includes("handler")) score += 30;
  if (baseLower.includes("router") || baseLower.includes("server")) score += 20;
  if (baseLower.includes("api") || baseLower.includes("controller")) score += 15;

  for (const hint of ROUTE_HINTS) {
    if (lower.includes(`/${hint}/`) || lower.startsWith(`${hint}/`)) score += 10;
  }

  if (lower.includes("/cmd/")) score += 12;
  if (lower.includes("/internal/")) score += 8;

  return score;
}
