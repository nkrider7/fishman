import type { IncludeEdge, RawRoute, RouterMount } from "./types";
import type { ParsedPythonModule } from "../../../parsers/ast/python-parser";
import { walkPythonAst } from "../../../parsers/ast/python-parser";
import {
  getAttributeChain,
  getCallTarget,
  getConstantValue,
  getKeywordArg,
  getLineNumber,
  getStringFromNode,
  isHttpMethod,
  isNodeType,
  normalizePath,
  toHttpMethod,
} from "./ast-utils";
import type { ASTNodeUnion, Call, FunctionDef } from "py-ast";

export function extractRouterMounts(
  mod: ParsedPythonModule,
  framework: "fastapi" | "flask" | "django",
): RouterMount[] {
  const mounts: RouterMount[] = [];

  walkPythonAst(mod.ast, (node) => {
    if (!isNodeType(node, "Assign")) return;
    const assign = node as { targets: ASTNodeUnion[]; value: ASTNodeUnion };
    if (!isNodeType(assign.value, "Call")) return;

    const call = assign.value as Call;
    const target = getAttributeChain(call.func) ?? "";
    const varName = assign.targets.find((t) => isNodeType(t, "Name"));
    if (!varName) return;
    const name = (varName as { id: string }).id;

    if (target.endsWith("FastAPI")) {
      mounts.push({ variable: name, prefix: "", kind: "app", sourceFile: mod.filePath, framework });
    }
    if (target.endsWith("APIRouter")) {
      const prefix = getStringFromNode(getKeywordArg(call, "prefix")) ?? "";
      mounts.push({ variable: name, prefix, kind: "router", sourceFile: mod.filePath, framework });
    }
    if (target.endsWith("Blueprint")) {
      const prefix = getStringFromNode(getKeywordArg(call, "url_prefix")) ?? "";
      mounts.push({ variable: name, prefix, kind: "blueprint", sourceFile: mod.filePath, framework });
    }
    if (target.endsWith("Flask")) {
      mounts.push({ variable: name, prefix: "", kind: "app", sourceFile: mod.filePath, framework });
    }
  });

  return mounts;
}

export function extractIncludeEdges(mod: ParsedPythonModule): IncludeEdge[] {
  const edges: IncludeEdge[] = [];

  walkPythonAst(mod.ast, (node) => {
    if (!isNodeType(node, "Call")) return;
    const call = node as Call;
    const target = getCallTarget(node);
    if (!target) return;

    if (target.endsWith("include_router")) {
      const parentVar = findCallReceiver(node);
      const childArg = call.args[0];
      const childVar = childArg && isNodeType(childArg, "Name") ? (childArg as { id: string }).id : null;
      if (!parentVar || !childVar) return;
      const prefix = getStringFromNode(getKeywordArg(call, "prefix")) ?? "";
      edges.push({ parentVar, childVar, prefix, sourceFile: mod.filePath });
    }

    if (target.endsWith("register_blueprint")) {
      const parentVar = findCallReceiver(node);
      const childArg = call.args[0];
      const childVar = childArg && isNodeType(childArg, "Name") ? (childArg as { id: string }).id : null;
      if (!parentVar || !childVar) return;
      const prefix = getStringFromNode(call.args[1]) ?? getStringFromNode(getKeywordArg(call, "url_prefix")) ?? "";
      edges.push({ parentVar, childVar, prefix, sourceFile: mod.filePath });
    }

    if (target.endsWith("include")) {
      const args = call.args;
      if (args.length >= 1) {
        const pathArg = getStringFromNode(args[0]);
        if (pathArg !== undefined) {
          edges.push({
            parentVar: "__urlpatterns__",
            childVar: getStringFromNode(args[1]) ?? "include",
            prefix: pathArg,
            sourceFile: mod.filePath,
          });
        }
      }
    }
  });

  return edges;
}

function findCallReceiver(node: ASTNodeUnion): string | null {
  if (!isNodeType(node, "Call")) return null;
  const func = (node as Call).func;
  if (isNodeType(func, "Attribute")) {
    return getAttributeChain((func as { value: ASTNodeUnion }).value);
  }
  return null;
}

export function composePrefix(
  varName: string,
  mounts: RouterMount[],
  includes: IncludeEdge[],
  visited = new Set<string>(),
): string {
  if (visited.has(varName)) return "";
  visited.add(varName);

  const mount = mounts.find((m) => m.variable === varName);
  let prefix = mount?.prefix ?? "";

  const parentEdge = includes.find((e) => e.childVar === varName);
  if (parentEdge) {
    const parentPrefix = composePrefix(parentEdge.parentVar, mounts, includes, visited);
    prefix = normalizePath(parentPrefix, parentEdge.prefix, prefix);
  }

  return prefix;
}

export function extractFastAPIRoutesFromModule(
  mod: ParsedPythonModule,
  mounts: RouterMount[],
  includes: IncludeEdge[],
  options: {
    schemas: import("./types").ClassSchema[];
    moduleAuth: import("./auth-detector").AuthPattern[];
    extractHandler: (fn: FunctionDef, path: string, method: string, prefix: string) => RawRoute | null;
  },
): RawRoute[] {
  const routes: RawRoute[] = [];

  walkPythonAst(mod.ast, (node) => {
    if (!isNodeType(node, "FunctionDef") && !isNodeType(node, "AsyncFunctionDef")) return;
    const fn = node as FunctionDef;

    for (const dec of fn.decorator_list ?? []) {
      const route = parseRouteDecorator(dec, fn, mod, mounts, includes, options);
      if (route) routes.push(route);
    }
  });

  return routes;
}

function parseRouteDecorator(
  dec: ASTNodeUnion,
  fn: FunctionDef,
  mod: ParsedPythonModule,
  mounts: RouterMount[],
  includes: IncludeEdge[],
  options: {
    moduleAuth: import("./auth-detector").AuthPattern[];
    extractHandler: (fn: FunctionDef, path: string, method: string, prefix: string) => RawRoute | null;
  },
): RawRoute | null {
  let call: Call | null = null;
  let receiver: string | null = null;
  let method: string | null = null;

  if (isNodeType(dec, "Call")) {
    call = dec as Call;
    const chain = getAttributeChain(call.func);
    if (!chain) return null;
    const parts = chain.split(".");
    method = parts.pop() ?? null;
    receiver = parts.join(".") || null;
  } else if (isNodeType(dec, "Attribute")) {
    const attr = dec as { value: ASTNodeUnion; attr: string };
    receiver = getAttributeChain(attr.value);
    method = attr.attr;
    call = { type: "Call", func: dec, args: [], keywords: [] } as unknown as Call;
  }

  if (!method || !isHttpMethod(method) || !receiver) return null;

  const routePath = call ? getStringFromNode(call.args[0]) ?? "" : "";
  const prefix = composePrefix(receiver, mounts, includes);
  const fullPath = normalizePath(prefix, routePath);

  const base = options.extractHandler(fn, fullPath, method, prefix);
  if (!base) return null;

  if (call && call.keywords.length > 0) {
    const summary = getStringFromNode(getKeywordArg(call, "summary"));
    const description = getStringFromNode(getKeywordArg(call, "description"));
    const tagsNode = getKeywordArg(call, "tags");
    const tags = tagsNode ? (getConstantValue(tagsNode) as string[]) ?? [] : [];

    if (summary) base.summary = summary;
    if (description) base.description = description;
    if (tags.length > 0) {
      base.tags = tags;
      base.folder = tags;
    }

    const statusKw = getKeywordArg(call, "status_code");
    if (statusKw) {
      const code = getConstantValue(statusKw);
      if (typeof code === "number") {
        base.responses = [{ statusCode: code }];
      }
    }
  }

  base.sourceFile = mod.filePath;
  base.lineNumber = getLineNumber(fn);
  base.handler = fn.name;

  return base;
}

export function extractFlaskRouteDecorators(
  mod: ParsedPythonModule,
  mounts: RouterMount[],
  includes: IncludeEdge[] = [],
): RawRoute[] {
  const routes: RawRoute[] = [];

  walkPythonAst(mod.ast, (node) => {
    if (!isNodeType(node, "FunctionDef") && !isNodeType(node, "AsyncFunctionDef")) return;
    const fn = node as FunctionDef;

    for (const dec of fn.decorator_list ?? []) {
      if (!isNodeType(dec, "Call")) continue;
      const call = dec as Call;
      const target = getCallTarget(dec);
      if (!target?.endsWith(".route") && target !== "route") continue;

      const receiver = target.replace(/\.route$/, "");
      const routePath = getStringFromNode(call.args[0]) ?? "/";
      const methodsNode = getKeywordArg(call, "methods");
      const methods = methodsNode
        ? (getConstantValue(methodsNode) as string[] | undefined)
        : ["GET"];

      const prefix = composePrefix(receiver, mounts, includes);
      const fullPath = normalizePath(prefix, routePath);

      for (const m of methods ?? ["GET"]) {
        routes.push({
          method: toHttpMethod(m),
          path: fullPath,
          handler: fn.name,
          tags: [],
          folder: [],
          sourceFile: mod.filePath,
          lineNumber: getLineNumber(fn),
          pathParameters: [],
          queryParameters: [],
          responses: [{ statusCode: 200 }],
          middleware: [],
          warnings: [],
        });
      }
    }
  });

  return routes;
}

export function extractFlaskAddUrlRules(mod: ParsedPythonModule): RawRoute[] {
  const routes: RawRoute[] = [];

  walkPythonAst(mod.ast, (node) => {
    if (!isNodeType(node, "Call")) return;
    const call = node as Call;
    const target = getCallTarget(node);
    if (!target?.endsWith("add_url_rule")) return;

    const routePath = getStringFromNode(call.args[0]);
    if (!routePath) return;
    const endpoint = getStringFromNode(call.args[1]);
    const methodsNode = getKeywordArg(call, "methods");
    const methods = methodsNode
      ? (getConstantValue(methodsNode) as string[])
      : ["GET"];

    for (const m of methods) {
      routes.push({
        method: toHttpMethod(m),
        path: routePath,
        handler: endpoint,
        tags: [],
        folder: [],
        sourceFile: mod.filePath,
        pathParameters: [],
        queryParameters: [],
        responses: [{ statusCode: 200 }],
        middleware: [],
        warnings: [],
      });
    }
  });

  return routes;
}
