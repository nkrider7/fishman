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
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "venv",
  ".venv",
  "env",
  ".env",
  "site-packages",
  "target",
  ".idea",
  ".vscode",
  "migrations",
]);

const PYTHON_EXTENSIONS = new Set([".py"]);

const ENTRY_FILE_NAMES = new Set([
  "main.py",
  "app.py",
  "server.py",
  "run.py",
  "manage.py",
  "wsgi.py",
  "asgi.py",
  "application.py",
]);

const ROUTE_HINT_DIRS = [
  "routes",
  "route",
  "routers",
  "router",
  "views",
  "view",
  "api",
  "apis",
  "endpoints",
  "controllers",
  "controller",
  "urls",
  "handlers",
  "blueprints",
  "apps",
  "app",
  "src",
  "server",
];

export interface DiscoveredPythonFile {
  absolutePath: string;
  relativePath: string;
  priority: number;
  isEntryFile: boolean;
}

export async function discoverPythonFiles(
  fs: FileSystemAdapter,
  projectPath: string,
  options?: {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxFiles?: number;
  },
): Promise<DiscoveredPythonFile[]> {
  const files: DiscoveredPythonFile[] = [];
  const maxFiles = options?.maxFiles ?? 5000;

  async function walk(dir: string, depth = 0): Promise<void> {
    if (files.length >= maxFiles || depth > 15) return;

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

      if (entry.isDirectory) {
        await walk(fullPath, depth + 1);
        continue;
      }

      const ext = entry.name.includes(".")
        ? entry.name.slice(entry.name.lastIndexOf("."))
        : "";
      if (!PYTHON_EXTENSIONS.has(ext)) continue;
      if (options?.includePatterns?.length) {
        if (!options.includePatterns.some((p) => fullPath.includes(p))) continue;
      }

      const relativePath = fs.relative(projectPath, fullPath);
      const basename = entry.name;
      const isEntryFile = ENTRY_FILE_NAMES.has(basename);
      const priority = scorePythonFile(relativePath, basename, isEntryFile);
      files.push({ absolutePath: fullPath, relativePath, priority, isEntryFile });
    }
  }

  await walk(projectPath);
  files.sort((a, b) => b.priority - a.priority);
  return files;
}

function scorePythonFile(
  relativePath: string,
  basename: string,
  isEntryFile: boolean,
): number {
  let score = 0;
  const lower = relativePath.toLowerCase();

  if (isEntryFile) score += 50;
  if (basename === "urls.py") score += 40;
  if (basename.includes("route") || basename.includes("router")) score += 25;
  if (basename.includes("view")) score += 20;

  for (const hint of ROUTE_HINT_DIRS) {
    if (lower.includes(`/${hint}/`) || lower.startsWith(`${hint}/`)) {
      score += 10;
    }
  }
  if (lower.includes("serializers")) score += 8;
  if (lower.includes("schemas")) score += 8;
  if (lower.includes("models")) score += 5;

  return score;
}

export function findEntryFiles(
  files: DiscoveredPythonFile[],
): DiscoveredPythonFile[] {
  const entries = files.filter((f) => f.isEntryFile);
  if (entries.length > 0) return entries;
  return files.filter((f) => f.priority >= 40).slice(0, 5);
}
