import type { FileSystemAdapter } from "../../../core/types";
import type { ASTNodeUnion } from "py-ast";
import type { ParsedPythonModule } from "../../../parsers/ast/python-parser";
import { walkPythonAst } from "../../../parsers/ast/python-parser";
import { getAttributeChain, getStringFromNode, isNodeType } from "./ast-utils";

export interface PythonImport {
  module: string;
  names: string[];
  alias?: string;
  isRelative: boolean;
  level: number;
  sourceFile: string;
}

export interface ResolvedImport {
  import: PythonImport;
  resolvedPath: string | null;
}

export class PythonImportResolver {
  private readonly moduleCache = new Map<string, ParsedPythonModule | null>();
  private readonly pathIndex = new Map<string, string>();
  private readonly packageDirs = new Set<string>();

  constructor(
    private readonly fs: FileSystemAdapter,
    private readonly projectPath: string,
    private readonly files: string[],
  ) {
    for (const file of files) {
      const rel = fs.relative(projectPath, file);
      const modPath = rel.replace(/\.py$/, "").replace(/\//g, ".");
      this.pathIndex.set(modPath, file);
      if (rel.endsWith("__init__.py")) {
        const pkg = rel.replace(/\/__init__\.py$/, "").replace(/\\/g, "/");
        this.packageDirs.add(pkg);
        const pkgMod = pkg.replace(/\//g, ".");
        this.pathIndex.set(pkgMod, file);
      }
    }
  }

  async getModule(filePath: string): Promise<ParsedPythonModule | null> {
    if (this.moduleCache.has(filePath)) return this.moduleCache.get(filePath) ?? null;
    try {
      const source = await this.fs.readFile(filePath);
      const { parsePythonSource } = await import("../../../parsers/ast/python-parser");
      const parsed = parsePythonSource(source, filePath);
      this.moduleCache.set(filePath, parsed);
      return parsed;
    } catch {
      this.moduleCache.set(filePath, null);
      return null;
    }
  }

  extractImports(ast: ASTNodeUnion, sourceFile: string): PythonImport[] {
    const imports: PythonImport[] = [];
    walkPythonAst(ast, (node) => {
      if (isNodeType(node, "Import")) {
        for (const alias of (node as { names: { name: string; asname?: string }[] }).names) {
          imports.push({
            module: alias.name,
            names: [alias.name.split(".").pop() ?? alias.name],
            alias: alias.asname,
            isRelative: false,
            level: 0,
            sourceFile,
          });
        }
      }
      if (isNodeType(node, "ImportFrom")) {
        const imp = node as {
          module: string | null;
          names: { name: string; asname?: string }[];
          level?: number;
        };
        const level = imp.level ?? 0;
        imports.push({
          module: imp.module ?? "",
          names: imp.names.map((n) => n.asname ?? n.name),
          isRelative: level > 0,
          level,
          sourceFile,
        });
      }
    });
    return imports;
  }

  resolveImport(imp: PythonImport, fromFile: string): string | null {
    const fromDir = fromFile.replace(/\/[^/]+$/, "");
    const relFrom = this.fs.relative(this.projectPath, fromDir);

    if (imp.isRelative) {
      const parts = relFrom.split("/").filter(Boolean);
      const up = imp.level - 1;
      const baseParts = parts.slice(0, Math.max(0, parts.length - up));
      const moduleParts = imp.module ? imp.module.split(".") : [];
      const full = [...baseParts, ...moduleParts].join(".");
      return this.resolveModulePath(full);
    }

    const direct = this.resolveModulePath(imp.module);
    if (direct) return direct;

    const fromParts = relFrom.split("/").filter(Boolean);
    for (let i = fromParts.length; i >= 0; i--) {
      const prefix = fromParts.slice(0, i).join(".");
      const candidate = prefix ? `${prefix}.${imp.module}` : imp.module;
      const resolved = this.resolveModulePath(candidate);
      if (resolved) return resolved;
    }
    return null;
  }

  resolveModulePath(modulePath: string): string | null {
    if (this.pathIndex.has(modulePath)) return this.pathIndex.get(modulePath)!;

    const asFile = modulePath.replace(/\./g, "/") + ".py";
    const candidate = `${this.projectPath}/${asFile}`;
    if (this.files.includes(candidate)) return candidate;

    const initCandidate = `${this.projectPath}/${modulePath.replace(/\./g, "/")}/__init__.py`;
    if (this.files.includes(initCandidate)) return initCandidate;

    return null;
  }

  resolveVariableModule(
    varName: string,
    fromFile: string,
    parsed: ParsedPythonModule,
  ): string | null {
    const imports = this.extractImports(parsed.ast, fromFile);
    for (const imp of imports) {
      if (imp.alias === varName || imp.names.includes(varName)) {
        return this.resolveImport(imp, fromFile);
      }
      if (imp.module.endsWith(`.${varName}`)) {
        return this.resolveImport(imp, fromFile);
      }
    }
    return null;
  }

  findAssignmentSource(
    varName: string,
    parsed: ParsedPythonModule,
  ): ASTNodeUnion | null {
    let found: ASTNodeUnion | null = null;
    walkPythonAst(parsed.ast, (node) => {
      if (found) return;
      if (isNodeType(node, "Assign")) {
        const assign = node as { targets: ASTNodeUnion[]; value: ASTNodeUnion };
        for (const target of assign.targets) {
          if (isNodeType(target, "Name") && (target as { id: string }).id === varName) {
            found = assign.value;
          }
        }
      }
    });
    return found;
  }

  getCallImportName(call: ASTNodeUnion): string | null {
    if (!isNodeType(call, "Call")) return null;
    const func = (call as { func: ASTNodeUnion }).func;
    return getAttributeChain(func) ?? (isNodeType(func, "Name") ? (func as { id: string }).id : null);
  }

  getStringArg(call: ASTNodeUnion, index = 0): string | undefined {
    if (!isNodeType(call, "Call")) return undefined;
    const args = (call as { args: ASTNodeUnion[] }).args;
    return getStringFromNode(args[index]);
  }
}
