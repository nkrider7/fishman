import type { FileSystemAdapter } from "../core/types";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
  "vendor",
  "__pycache__",
  "target",
  ".idea",
  ".vscode",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

const ROUTE_HINT_DIRS = [
  "routes",
  "route",
  "controllers",
  "controller",
  "modules",
  "module",
  "api",
  "apis",
  "src",
  "server",
  "app",
  "handlers",
  "middlewares",
  "middleware",
  "validators",
  "schemas",
  "services",
];

export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  priority: number;
}

export async function discoverSourceFiles(
  fs: FileSystemAdapter,
  projectPath: string,
  options?: {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxFiles?: number;
  },
): Promise<DiscoveredFile[]> {
  const files: DiscoveredFile[] = [];
  const maxFiles = options?.maxFiles ?? 2000;

  async function walk(dir: string, depth = 0): Promise<void> {
    if (files.length >= maxFiles || depth > 12) return;

    let entries: import("../core/types").FsDirEntry[];
    try {
      entries = await fs.readDir(dir);
    } catch (err) {
      if (depth === 0) {
        throw new Error(
          `Cannot read project directory. Grant filesystem access when prompted, or re-select the folder. ${err instanceof Error ? err.message : ""}`,
        );
      }
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const fullPath = await fs.join(dir, entry.name);

      if (DEFAULT_IGNORE.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".") continue;

      if (options?.excludePatterns?.some((p) => fullPath.includes(p))) continue;

      if (entry.isDirectory) {
        await walk(fullPath, depth + 1);
        continue;
      }

      const ext = entry.name.includes(".")
        ? entry.name.slice(entry.name.lastIndexOf("."))
        : "";
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (options?.includePatterns?.length) {
        const matches = options.includePatterns.some((p) =>
          fullPath.includes(p),
        );
        if (!matches) continue;
      }

      const relativePath = fs.relative(projectPath, fullPath);
      const priority = scoreFile(relativePath);
      files.push({ absolutePath: fullPath, relativePath, priority });
    }
  }

  await walk(projectPath);
  files.sort((a, b) => b.priority - a.priority);
  return files;
}

function scoreFile(relativePath: string): number {
  const lower = relativePath.toLowerCase();
  let score = 0;
  for (const hint of ROUTE_HINT_DIRS) {
    if (lower.includes(`/${hint}/`) || lower.startsWith(`${hint}/`)) {
      score += 10;
    }
  }
  if (lower.includes("route")) score += 15;
  if (lower.includes("controller")) score += 12;
  if (lower.includes("api")) score += 8;
  if (lower.endsWith(".routes.ts") || lower.endsWith(".routes.js")) score += 20;
  if (lower.includes("index.")) score += 3;
  return score;
}

export async function readPackageJson(
  fs: FileSystemAdapter,
  projectPath: string,
) {
  const pkgPath = await fs.join(projectPath, "package.json");
  if (!(await fs.exists(pkgPath))) return null;
  try {
    const content = await fs.readFile(pkgPath);
    return JSON.parse(content) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
  } catch {
    return null;
  }
}

export function getAllDependencies(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}
