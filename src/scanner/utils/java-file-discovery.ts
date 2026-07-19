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

const JAVA_EXTENSIONS = new Set([".java"]);

const CONTROLLER_HINTS = [
  "controller",
  "controllers",
  "resource",
  "resources",
  "api",
  "apis",
  "web",
  "rest",
  "endpoint",
  "endpoints",
];

export interface DiscoveredJavaFile {
  absolutePath: string;
  relativePath: string;
  priority: number;
  isMainSource: boolean;
}

export async function discoverJavaFiles(
  fs: FileSystemAdapter,
  projectPath: string,
  options?: {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxFiles?: number;
    preferMainSources?: boolean;
  },
): Promise<DiscoveredJavaFile[]> {
  const files: DiscoveredJavaFile[] = [];
  const maxFiles = options?.maxFiles ?? 5000;
  const preferMain = options?.preferMainSources !== false;

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

      // Skip test trees by default
      const norm = fullPath.replace(/\\/g, "/");
      if (preferMain && /\/src\/test\//.test(norm)) continue;

      if (entry.isDirectory) {
        await walk(fullPath, depth + 1);
        continue;
      }

      const ext = entry.name.includes(".")
        ? entry.name.slice(entry.name.lastIndexOf("."))
        : "";
      if (!JAVA_EXTENSIONS.has(ext)) continue;
      if (options?.includePatterns?.length) {
        if (!options.includePatterns.some((p) => fullPath.includes(p))) continue;
      }

      const relativePath = fs.relative(projectPath, fullPath).replace(/\\/g, "/");
      const isMainSource = /(?:^|\/)src\/main\/java\//.test(relativePath);
      const priority = scoreJavaFile(relativePath, entry.name, isMainSource);
      files.push({ absolutePath: fullPath, relativePath, priority, isMainSource });
    }
  }

  await walk(projectPath);
  files.sort((a, b) => b.priority - a.priority);
  return files;
}

function scoreJavaFile(
  relativePath: string,
  basename: string,
  isMainSource: boolean,
): number {
  let score = 0;
  const lower = relativePath.toLowerCase();
  const baseLower = basename.toLowerCase();

  if (isMainSource) score += 40;
  if (baseLower.includes("controller") || baseLower.includes("resource")) score += 30;
  if (baseLower.includes("application") && baseLower.endsWith(".java")) score += 20;
  if (baseLower.includes("dto") || baseLower.includes("request") || baseLower.includes("payload")) {
    score += 12;
  }

  for (const hint of CONTROLLER_HINTS) {
    if (lower.includes(`/${hint}/`) || lower.includes(`/${hint}s/`)) {
      score += 10;
    }
  }

  if (lower.includes("/dto/") || lower.includes("/model/") || lower.includes("/request/")) {
    score += 8;
  }

  return score;
}

export async function discoverSourceRoots(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<string[]> {
  const roots: string[] = [];
  const seen = new Set<string>();

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 10) return;
    let entries: import("../core/types").FsDirEntry[];
    try {
      entries = await fs.readDir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (DEFAULT_IGNORE.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (!entry.isDirectory) continue;

      const fullPath = await fs.join(dir, entry.name);
      const norm = fullPath.replace(/\\/g, "/");
      if (norm.endsWith("/src/main/java")) {
        const key = norm;
        if (!seen.has(key)) {
          seen.add(key);
          roots.push(fullPath);
        }
        continue;
      }
      await walk(fullPath, depth + 1);
    }
  }

  await walk(projectPath);
  if (roots.length === 0) {
    const fallback = await fs.join(projectPath, "src", "main", "java");
    if (await safeExists(fs, fallback)) roots.push(fallback);
  }
  return roots;
}

async function safeExists(fs: FileSystemAdapter, path: string): Promise<boolean> {
  try {
    return await fs.exists(path);
  } catch {
    return false;
  }
}
