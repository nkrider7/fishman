import { parseModule, type ASTNodeUnion, type Module } from "py-ast";

export interface ParsedPythonModule {
  ast: Module;
  source: string;
  filePath: string;
  warnings: string[];
}

const parseCache = new Map<string, ParsedPythonModule>();

export function clearPythonParseCache(): void {
  parseCache.clear();
}

export function parsePythonSource(
  source: string,
  filePath: string,
): ParsedPythonModule | null {
  const cacheKey = `${filePath}:${source.length}:${hashString(source)}`;
  const cached = parseCache.get(cacheKey);
  if (cached) return cached;

  try {
    const ast = parseModule(source, filePath);
    const result: ParsedPythonModule = {
      ast,
      source,
      filePath,
      warnings: [],
    };
    parseCache.set(cacheKey, result);
    return result;
  } catch (err) {
    return {
      ast: { type: "Module", body: [] } as unknown as Module,
      source,
      filePath,
      warnings: [
        `Syntax error: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

export async function parsePythonFile(
  readFile: (path: string) => Promise<string>,
  filePath: string,
): Promise<ParsedPythonModule | null> {
  const cacheKey = `file:${filePath}`;
  const cached = parseCache.get(cacheKey);
  if (cached) return cached;

  try {
    const source = await readFile(filePath);
    const result = parsePythonSource(source, filePath);
    if (result) parseCache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export function walkPythonAst(
  node: ASTNodeUnion,
  visit: (node: ASTNodeUnion, parent?: ASTNodeUnion) => void,
  parent?: ASTNodeUnion,
): void {
  visit(node, parent);
  for (const child of getChildNodes(node)) {
    walkPythonAst(child, visit, node);
  }
}

export function getChildNodes(node: ASTNodeUnion): ASTNodeUnion[] {
  const children: ASTNodeUnion[] = [];
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "lineno" || key === "col_offset") continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && ("type" in item || "nodeType" in item)) {
          children.push(item as ASTNodeUnion);
        }
      }
    } else if (typeof value === "object" && ("type" in value || "nodeType" in value)) {
      children.push(value as ASTNodeUnion);
    }
  }
  return children;
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}
