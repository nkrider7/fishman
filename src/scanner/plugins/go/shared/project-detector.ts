import type { FileSystemAdapter } from "../../../core/types";
import type { GoDependencies, GoProjectInfo } from "./types";

const GIN_MODULES = ["github.com/gin-gonic/gin"];
const ECHO_MODULES = [
  "github.com/labstack/echo",
  "github.com/labstack/echo/v4",
];
const CHI_MODULES = [
  "github.com/go-chi/chi",
  "github.com/go-chi/chi/v5",
];

export async function detectGoProject(
  fs: FileSystemAdapter,
  projectPath: string,
): Promise<GoProjectInfo> {
  const warnings: string[] = [];
  const goModPath = await fs.join(projectPath, "go.mod");
  const content = await safeReadFile(fs, goModPath);

  if (!content) {
    warnings.push("No go.mod found at project root.");
    return {
      dependencies: {},
      warnings,
      projectRoot: projectPath,
    };
  }

  const modulePath = parseModulePath(content);
  const dependencies = parseGoModRequires(content);

  return {
    modulePath,
    dependencies,
    warnings,
    projectRoot: projectPath,
  };
}

export function parseModulePath(content: string): string | undefined {
  const match = content.match(/^module\s+(\S+)/m);
  return match?.[1];
}

export function parseGoModRequires(content: string): GoDependencies {
  const deps: GoDependencies = {};

  // require ( ... ) block
  const blockRe = /require\s*\(([\s\S]*?)\)/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRe.exec(content)) !== null) {
    for (const line of blockMatch[1].split("\n")) {
      const cleaned = line.replace(/\/\/.*$/, "").trim();
      if (!cleaned) continue;
      const parts = cleaned.split(/\s+/);
      if (parts.length >= 2) {
        deps[parts[0]] = parts[1];
      }
    }
  }

  // single-line require
  for (const match of content.matchAll(/^require\s+(\S+)\s+(\S+)/gm)) {
    deps[match[1]] = match[2];
  }

  return deps;
}

export function normalizeGoModulePath(modulePath: string): string {
  // Strip /vN version suffix for comparison of major versions > 1
  return modulePath.replace(/\/v\d+$/, "");
}

export function hasGoDependency(
  deps: GoDependencies,
  modulePath: string,
): boolean {
  const target = normalizeGoModulePath(modulePath);
  return Object.keys(deps).some((key) => {
    const normalized = normalizeGoModulePath(key);
    return (
      normalized === target ||
      key === modulePath ||
      key.startsWith(modulePath + "/") ||
      normalized.startsWith(target)
    );
  });
}

export function hasGinDependency(deps: GoDependencies): boolean {
  return GIN_MODULES.some((m) => hasGoDependency(deps, m));
}

export function hasEchoDependency(deps: GoDependencies): boolean {
  return ECHO_MODULES.some((m) => hasGoDependency(deps, m));
}

export function hasChiDependency(deps: GoDependencies): boolean {
  return CHI_MODULES.some((m) => hasGoDependency(deps, m));
}

export function sourceHasGinImport(source: string): boolean {
  return /["']github\.com\/gin-gonic\/gin["']/.test(source);
}

export function sourceHasEchoImport(source: string): boolean {
  return /["']github\.com\/labstack\/echo(?:\/v\d+)?["']/.test(source);
}

export function sourceHasChiImport(source: string): boolean {
  return /["']github\.com\/go-chi\/chi(?:\/v\d+)?["']/.test(source);
}

export function sourceHasNetHttpImport(source: string): boolean {
  return /["']net\/http["']/.test(source);
}

/**
 * Positive server-side route registration signals for stdlib net/http.
 * Does not treat client-only usage (http.Get / NewRequest) as routes.
 */
export function sourceHasNetHttpServerRoutes(source: string): boolean {
  if (
    /\bhttp\.NewServeMux\s*\(/.test(source) ||
    /\bhttp\.Handle(?:Func)?\s*\(/.test(source)
  ) {
    return true;
  }

  // mux.HandleFunc("GET /path", ...) Go 1.22 method-aware patterns
  if (
    /\.\s*Handle(?:Func)?\s*\(\s*["`](?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i.test(
      source,
    )
  ) {
    return true;
  }

  // Local mux with HandleFunc after NewServeMux (already covered) or aliased package
  if (
    /NewServeMux\s*\(/.test(source) &&
    /\.\s*Handle(?:Func)?\s*\(/.test(source) &&
    sourceHasNetHttpImport(source)
  ) {
    return true;
  }

  return false;
}

/** True when the file is clearly a Gin/Echo/Chi router (avoid net/http false positives). */
export function sourceIsGoFrameworkRouter(source: string): boolean {
  return (
    sourceHasGinImport(source) ||
    sourceHasEchoImport(source) ||
    sourceHasChiImport(source) ||
    /\bchi\.NewRouter\s*\(/.test(source) ||
    /\bgin\.(?:Default|New)\s*\(/.test(source) ||
    /\becho\.New\s*\(/.test(source)
  );
}

async function safeReadFile(
  fs: FileSystemAdapter,
  path: string,
): Promise<string | null> {
  try {
    if (!(await fs.exists(path))) return null;
    return await fs.readFile(path);
  } catch {
    return null;
  }
}
