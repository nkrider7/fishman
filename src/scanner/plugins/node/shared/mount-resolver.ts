import type { DiscoveredFile } from "../../../utils/file-discovery";
import type { FileSystemAdapter } from "../../../core/types";
import {
  findImports,
  getStringLiteral,
  normalizeRoutePath,
  parseSource,
  traverseAst,
} from "../../../parsers/analysis/extractors";
import * as t from "@babel/types";
import type { NodePath } from "@babel/traverse";

/** Maps route file → full mount prefix from app.use / router.use chains */
export type GlobalMountMap = Map<string, string>;

interface MountEdge {
  parentFile: string;
  mountPath: string;
}

interface ResolvedMount {
  targetFile: string;
  parentFile: string;
  mountPath: string;
}

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
    `${joined}.mjs`,
    `${joined}.cjs`,
    `${joined}/index.ts`,
    `${joined}/index.js`,
  ];

  for (const candidate of candidates) {
    if (fileIndex.has(candidate)) return candidate;
  }

  const baseName = joined.split("/").pop() ?? joined;
  for (const file of fileIndex) {
    if (file.endsWith(`/${baseName}.ts`) || file.endsWith(`/${baseName}.js`)) {
      return file;
    }
  }

  return null;
}

function collectModuleBindings(
  parsed: ReturnType<typeof parseSource>,
  fromFile: string,
  fileIndex: Set<string>,
): Map<string, string> {
  const bindings = new Map<string, string>();
  if (!parsed) return bindings;

  for (const [local, source] of findImports(parsed)) {
    const resolved = resolveImportToFile(source, fromFile, fileIndex);
    if (resolved) bindings.set(local, resolved);
  }

  traverseAst(parsed, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isIdentifier(path.node.id) || !t.isCallExpression(path.node.init)) return;
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

function extractPrefixFromOptions(arg: t.Node | undefined): string {
  if (!arg || !t.isObjectExpression(arg)) return "";
  for (const prop of arg.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;
    if (key === "prefix") {
      return getStringLiteral(prop.value) ?? "";
    }
  }
  return "";
}

function pushMountEdge(
  edges: ResolvedMount[],
  fromFile: string,
  bindings: Map<string, string>,
  targetArg: t.Expression | undefined,
  mountPath: string,
): void {
  if (!targetArg || !t.isIdentifier(targetArg)) return;
  const targetFile = bindings.get(targetArg.name);
  if (!targetFile) return;
  edges.push({
    targetFile,
    parentFile: fromFile,
    mountPath,
  });
}

function collectMountEdges(
  parsed: ReturnType<typeof parseSource>,
  fromFile: string,
  bindings: Map<string, string>,
): ResolvedMount[] {
  const edges: ResolvedMount[] = [];
  if (!parsed) return edges;

  traverseAst(parsed, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return;
      const prop = path.node.callee.property;
      if (!t.isIdentifier(prop)) return;
      if (!t.isIdentifier(path.node.callee.object)) return;

      const arg0 = path.node.arguments[0];
      const arg1 = path.node.arguments[1];

      if (prop.name === "register") {
        if (!arg0 || !t.isExpression(arg0)) return;
        const mountPath =
          arg1 && t.isExpression(arg1) ? extractPrefixFromOptions(arg1) : "";
        pushMountEdge(edges, fromFile, bindings, arg0, mountPath);
        return;
      }

      if (prop.name !== "use") return;

      if (arg1 && t.isExpression(arg1) && t.isIdentifier(arg1)) {
        pushMountEdge(edges, fromFile, bindings, arg1, getStringLiteral(arg0) ?? "");
        return;
      }

      if (
        arg0 &&
        t.isExpression(arg0) &&
        t.isIdentifier(arg0) &&
        !getStringLiteral(arg0)
      ) {
        pushMountEdge(edges, fromFile, bindings, arg0, "");
      }
    },
  });

  return edges;
}

function composeMountPrefix(edges: Map<string, MountEdge>, file: string): string {
  const parts: string[] = [];
  let current: string | undefined = file;
  const visited = new Set<string>();

  while (current && edges.has(current) && !visited.has(current)) {
    visited.add(current);
    const mountEdge: MountEdge = edges.get(current)!;
    if (mountEdge.mountPath) parts.unshift(mountEdge.mountPath);
    current = mountEdge.parentFile;
  }

  if (parts.length === 0) return "";
  return normalizeRoutePath(parts.join(""));
}

export async function buildGlobalMountMap(
  fs: FileSystemAdapter,
  files: DiscoveredFile[],
): Promise<GlobalMountMap> {
  const fileIndex = new Set(files.map((f) => f.relativePath.replace(/\\/g, "/")));
  const edges = new Map<string, MountEdge>();

  for (const file of files) {
    let code: string;
    try {
      code = await fs.readFile(file.absolutePath);
    } catch {
      continue;
    }

    const rel = file.relativePath.replace(/\\/g, "/");
    const parsed = parseSource(code, rel);
    if (!parsed) continue;

    const bindings = collectModuleBindings(parsed, rel, fileIndex);

    for (const edge of collectMountEdges(parsed, rel, bindings)) {
      if (!edges.has(edge.targetFile)) {
        edges.set(edge.targetFile, {
          parentFile: edge.parentFile,
          mountPath: edge.mountPath,
        });
      }
    }
  }

  const result: GlobalMountMap = new Map();
  for (const file of fileIndex) {
    const prefix = composeMountPrefix(edges, file);
    if (prefix) result.set(file, prefix);
  }

  return result;
}
