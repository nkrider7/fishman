import { parse, type ParserOptions } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export interface ParsedSource {
  ast: t.File;
  code: string;
  filePath: string;
}

export function parseSource(code: string, filePath: string): ParsedSource | null {
  try {
    const ast = parse(code, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        "typescript",
        "jsx",
        "decorators-legacy",
        "importMeta",
      ] as ParserOptions["plugins"],
      sourceFilename: filePath,
      errorRecovery: true,
    });
    return { ast, code, filePath };
  } catch {
    return null;
  }
}

export function getStringLiteral(node: t.Node | null | undefined): string | null {
  if (!node) return null;
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked ?? "").join("");
  }
  return null;
}

export function getIdentifierName(node: t.Node | null | undefined): string | null {
  if (!node) return null;
  if (t.isIdentifier(node)) return node.name;
  if (t.isStringLiteral(node)) return node.value;
  return null;
}

export function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const regex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match;
  while ((match = regex.exec(path)) !== null) {
    params.push(match[1]);
  }
  const bracketRegex = /\[([^\]]+)\]/g;
  while ((match = bracketRegex.exec(path)) !== null) {
    if (!match[1].startsWith("...")) params.push(match[1].replace("...", ""));
  }
  return params;
}

export function normalizeRoutePath(path: string, prefix = ""): string {
  let combined = `${prefix}${path}`.replace(/\\/g, "/");
  if (!combined.startsWith("/")) combined = `/${combined}`;
  combined = combined.replace(/\/+/g, "/");
  return combined;
}

export function traverseAst(
  parsed: ParsedSource,
  visitor: Parameters<typeof traverse>[1],
): void {
  traverse(parsed.ast, visitor);
}

export function findImports(parsed: ParsedSource): Map<string, string> {
  const imports = new Map<string, string>();
  traverseAst(parsed, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value;
      for (const spec of path.node.specifiers) {
        if (t.isImportDefaultSpecifier(spec)) {
          imports.set(spec.local.name, source);
        } else if (t.isImportSpecifier(spec)) {
          const imported = t.isIdentifier(spec.imported)
            ? spec.imported.name
            : spec.imported.value;
          imports.set(spec.local.name, source);
          imports.set(imported, source);
        } else if (t.isImportNamespaceSpecifier(spec)) {
          imports.set(spec.local.name, source);
        }
      }
    },
  });
  return imports;
}

export function isHttpMethod(name: string): boolean {
  return ["get", "post", "put", "patch", "delete", "options", "head", "all"].includes(
    name.toLowerCase(),
  );
}

export function toHttpMethod(name: string): string {
  return name.toUpperCase() === "ALL" ? "GET" : name.toUpperCase();
}
