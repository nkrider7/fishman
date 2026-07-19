export interface GitTreeItem {
  path: string;
  type: "blob" | "tree" | string;
  size?: number;
  sha?: string;
  url?: string;
}

const EXCLUDED_DIR_SEGMENTS = new Set([
  ".git",
  "node_modules",
  "target",
  "build",
  "dist",
  ".gradle",
  ".idea",
  ".vscode",
  "coverage",
  "vendor",
  "__pycache__",
  ".next",
  "out",
  "bin",
  ".turbo",
  ".cache",
]);

const EXCLUDED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".pdf",
  ".zip",
  ".jar",
  ".war",
  ".class",
  ".o",
  ".so",
  ".dylib",
  ".exe",
  ".dll",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".mp3",
  ".lock",
]);

const MANIFEST_NAMES = new Set([
  "package.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "application.properties",
  "application.yml",
  "application.yaml",
]);

const SOURCE_EXTENSIONS = new Set([
  ".java",
  ".kt",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".php",
  ".cs",
  ".rb",
]);

export interface FetchPlanOptions {
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  subpath?: string;
}

export interface PlannedFile {
  path: string;
  size: number;
}

/**
 * Select scan-relevant blob paths from a GitHub recursive tree.
 */
export function planFilesToFetch(
  tree: GitTreeItem[],
  options: FetchPlanOptions = {},
): { files: PlannedFile[]; warnings: string[]; truncated: boolean } {
  const maxFiles = options.maxFiles ?? 3000;
  const maxFileBytes = options.maxFileBytes ?? 1_500_000;
  const maxTotalBytes = options.maxTotalBytes ?? 35_000_000;
  const subpath = options.subpath?.replace(/^\/+|\/+$/g, "");

  const warnings: string[] = [];
  const selected: PlannedFile[] = [];
  let totalBytes = 0;
  let truncated = false;

  for (const item of tree) {
    if (item.type !== "blob") continue;
    const path = item.path.replace(/\\/g, "/");
    if (subpath && path !== subpath && !path.startsWith(`${subpath}/`)) continue;
    if (!shouldIncludePath(path)) continue;

    const size = item.size ?? 0;
    if (size > maxFileBytes) {
      warnings.push(`Skipped large file (${size} bytes): ${path}`);
      continue;
    }
    if (selected.length >= maxFiles) {
      truncated = true;
      break;
    }
    if (totalBytes + size > maxTotalBytes) {
      truncated = true;
      warnings.push("Reached download size limit; some files were skipped.");
      break;
    }

    selected.push({ path, size });
    totalBytes += size;
  }

  if (truncated) {
    warnings.push(
      `File list truncated at ${selected.length} files. Scan may be incomplete.`,
    );
  }

  return { files: selected, warnings, truncated };
}

export function shouldIncludePath(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  for (const part of parts.slice(0, -1)) {
    if (EXCLUDED_DIR_SEGMENTS.has(part)) return false;
  }

  const basename = parts[parts.length - 1] ?? "";
  if (!basename) return false;

  if (MANIFEST_NAMES.has(basename) || basename === ".env") return true;

  const ext = basename.includes(".")
    ? basename.slice(basename.lastIndexOf(".")).toLowerCase()
    : "";
  if (EXCLUDED_EXTENSIONS.has(ext)) return false;
  if (SOURCE_EXTENSIONS.has(ext)) return true;

  if (
    basename.endsWith(".yml") ||
    basename.endsWith(".yaml") ||
    basename.endsWith(".properties") ||
    basename.endsWith(".xml") ||
    basename.endsWith(".gradle") ||
    basename.endsWith(".kts")
  ) {
    return true;
  }

  return false;
}
