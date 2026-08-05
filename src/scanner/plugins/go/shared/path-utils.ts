import type { ApiParameter } from "../../../models/endpoint";

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
  // Go 1.22 ServeMux exact root
  p = p.replace(/\/\{\$\}/g, "/");
  p = p.replace(/\{\$\}/g, "");
  // Go 1.22 trailing wildcard {path...} → {path}
  p = p.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\.\.\.\}/g, "{$1}");
  // Gin/Echo :param → {param}
  p = p.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
  // Chi wildcard *filepath → {filepath}
  p = p.replace(/\*([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

export function extractPathParamsFromPattern(path: string): ApiParameter[] {
  const params: ApiParameter[] = [];
  const seen = new Set<string>();
  const normalized = normalizePath(path);

  for (const match of normalized.matchAll(/\{([^}:]+)(?::[^}]+)?\}/g)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    params.push({
      name,
      type: "string",
      required: true,
      in: "path",
      example: name === "id" || name.endsWith("Id") || name.endsWith("_id") ? "1" : name,
    });
  }

  return params;
}

export function folderFromPathAndFile(
  fullPath: string,
  relativePath: string,
  groupPrefix?: string,
): string[] {
  const pathParts = fullPath
    .replace(/\{[^}]+\}/g, "")
    .split("/")
    .filter(Boolean);

  if (groupPrefix) {
    const nestParts = groupPrefix.split("/").filter(Boolean);
    if (nestParts.length > 0) {
      const after = pathParts.slice(nestParts.length);
      if (after.length > 0) return [after[0]];
      return [nestParts[nestParts.length - 1]];
    }
  }

  if (pathParts.length >= 2) {
    return [pathParts[pathParts.length - 1]];
  }
  if (pathParts.length === 1) return [pathParts[0]];

  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return ["General"];
  const dir = parts[parts.length - 2];
  if ([".", "cmd", "internal", "pkg", "api"].includes(dir) && parts.length >= 3) {
    return [parts[parts.length - 3] === "src" ? parts[parts.length - 2] : parts[parts.length - 3]];
  }
  return dir === "." ? ["General"] : [dir];
}

export function lineNumberAtIndex(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

export function humanizeHandlerName(name?: string): string | undefined {
  if (!name) return undefined;
  const simple = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  return simple
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
