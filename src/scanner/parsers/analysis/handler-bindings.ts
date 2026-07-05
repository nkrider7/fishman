import type { ParsedSource } from "../ast/babel-parser";
import { findImports, getStringLiteral, traverseAst } from "../ast/babel-parser";
import * as t from "@babel/types";
import type { NodePath } from "@babel/traverse";

function normalizeRelativePath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

function resolveImportToFile(
  importSource: string,
  fromFile: string,
  fileIndex: Set<string>,
): string | null {
  if (!importSource.startsWith(".")) return null;

  const fromDir = fromFile.includes("/")
    ? fromFile.slice(0, fromFile.lastIndexOf("/"))
    : "";
  const joined = normalizeRelativePath(
    `${fromDir}/${importSource}`.replace(/\/+/g, "/"),
  );

  const candidates = [
    joined,
    `${joined}.ts`,
    `${joined}.js`,
    `${joined}.tsx`,
    `${joined}.jsx`,
    `${joined}/index.ts`,
    `${joined}/index.js`,
  ];

  for (const candidate of candidates) {
    if (fileIndex.has(candidate)) return candidate;
  }

  return null;
}

export function collectModuleBindings(
  parsed: ParsedSource,
  fromFile: string,
  fileIndex: Set<string>,
): Map<string, string> {
  const bindings = new Map<string, string>();

  for (const [local, source] of findImports(parsed)) {
    const resolved = resolveImportToFile(source, fromFile, fileIndex);
    if (resolved) bindings.set(local, resolved);
  }

  traverseAst(parsed, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isIdentifier(path.node.id) || !t.isCallExpression(path.node.init)) {
        return;
      }
      const callee = path.node.init.callee;
      if (!t.isIdentifier(callee) || callee.name !== "require") return;
      const source = getStringLiteral(path.node.init.arguments[0]);
      if (!source) return;
      const resolved = resolveImportToFile(source, fromFile, fileIndex);
      if (resolved) bindings.set(path.node.id.name, resolved);
    },
  });

  return bindings;
}
