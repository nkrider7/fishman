import type { ApiParameter } from "../../../models/endpoint";

/** Join class-level and method-level Spring paths. */
export function joinPaths(...parts: Array<string | undefined | null>): string {
  const cleaned = parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());

  if (cleaned.length === 0) return "/";

  let result = "";
  for (const part of cleaned) {
    const segment = part.replace(/^\/+|\/+$/g, "");
    if (!segment) {
      if (!result) result = "/";
      continue;
    }
    result = result === "/" || result === "" ? `/${segment}` : `${result}/${segment}`;
  }

  return normalizePath(result || "/");
}

export function normalizePath(path: string): string {
  let p = path.trim() || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/** Convert `{id:\\d+}` style vars to `{id}` for display and param extraction. */
export function simplifySpringPath(path: string): { path: string; warnings: string[] } {
  const warnings: string[] = [];
  const simplified = path.replace(/\{([^}:]+)(?::[^}]+)?\}/g, (_m, name: string) => {
    if (_m.includes(":")) {
      warnings.push(`Stripped path variable regex for '{${name}}'`);
    }
    return `{${name}}`;
  });
  return { path: normalizePath(simplified), warnings };
}

export function extractPathParamsFromPattern(path: string): ApiParameter[] {
  const params: ApiParameter[] = [];
  const seen = new Set<string>();
  for (const match of path.matchAll(/\{([^}:]+)(?::[^}]+)?\}/g)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    params.push({
      name,
      type: "string",
      required: true,
      in: "path",
      example: name === "id" || name.endsWith("Id") ? "1" : name,
    });
  }
  return params;
}

export function applyGlobalPrefix(
  path: string,
  contextPath?: string,
  servletPath?: string,
): string {
  return joinPaths(contextPath, servletPath, path);
}

export function folderFromControllerName(className: string): string[] {
  const base = className.replace(/(Rest)?Controller$/i, "").replace(/Resource$/i, "");
  if (!base || base === className) {
    return className ? [className] : ["General"];
  }
  return [base];
}

export function humanizeMethodName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
