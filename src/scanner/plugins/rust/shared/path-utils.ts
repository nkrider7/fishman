import type { ApiParameter } from "../../../models/endpoint";

/** Join scope/nest prefixes with route paths. */
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
  // Convert Axum-style :param to {param}
  p = p.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
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
      example: name === "id" || name.endsWith("_id") || name.endsWith("Id") ? "1" : name,
    });
  }

  return params;
}

export function folderFromFilePath(relativePath: string): string[] {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return ["General"];
  const dir = parts[parts.length - 2];
  if (dir === "src" || dir === "routes" || dir === "handlers") {
    return parts.length >= 3 ? [parts[parts.length - 3]] : ["General"];
  }
  return [dir];
}

export function lineNumberAtIndex(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}
