import type { ASTNodeUnion } from "py-ast";
import type { Call, ClassDef, FunctionDef, Keyword } from "py-ast";

export function nodeType(node: ASTNodeUnion): string {
  const n = node as unknown as { type?: string; nodeType?: string };
  return n.nodeType ?? n.type ?? "";
}

export function isNodeType(node: ASTNodeUnion, type: string): boolean {
  return nodeType(node) === type;
}

export function getAttributeChain(node: ASTNodeUnion): string | null {
  if (isNodeType(node, "Name")) {
    return (node as { id: string }).id;
  }
  if (isNodeType(node, "Attribute")) {
    const attr = node as { value: ASTNodeUnion; attr: string };
    const base = getAttributeChain(attr.value);
    return base ? `${base}.${attr.attr}` : attr.attr;
  }
  return null;
}

export function getCallTarget(node: ASTNodeUnion): string | null {
  if (!isNodeType(node, "Call")) return null;
  return getAttributeChain((node as Call).func);
}

export function getConstantValue(node: ASTNodeUnion): unknown {
  if (isNodeType(node, "Constant")) {
    return (node as { value: unknown }).value;
  }
  if (isNodeType(node, "JoinedStr")) {
    const parts = (node as { values: ASTNodeUnion[] }).values;
    return parts
      .map((p) => (isNodeType(p, "Constant") ? String(getConstantValue(p)) : ""))
      .join("");
  }
  if (isNodeType(node, "List")) {
    return (node as { elts: ASTNodeUnion[] }).elts.map(getConstantValue);
  }
  if (isNodeType(node, "Tuple")) {
    return (node as { elts: ASTNodeUnion[] }).elts.map(getConstantValue);
  }
  if (isNodeType(node, "Dict")) {
    const dict = node as { keys: (ASTNodeUnion | null)[]; values: ASTNodeUnion[] };
    const result: Record<string, unknown> = {};
    for (let i = 0; i < dict.keys.length; i++) {
      const key = dict.keys[i];
      if (key) result[String(getConstantValue(key))] = getConstantValue(dict.values[i]);
    }
    return result;
  }
  if (isNodeType(node, "UnaryOp") && isNodeType((node as { operand: ASTNodeUnion }).operand, "Constant")) {
    const op = (node as unknown as { op: { type: string } }).op.type;
    const val = getConstantValue((node as { operand: ASTNodeUnion }).operand);
    if (op === "USub" && typeof val === "number") return -val;
  }
  return undefined;
}

export function getStringFromNode(node: ASTNodeUnion | undefined): string | undefined {
  if (!node) return undefined;
  const val = getConstantValue(node);
  return typeof val === "string" ? val : undefined;
}

export function getKeywordArg(
  call: Call,
  name: string,
): ASTNodeUnion | undefined {
  for (const kw of call.keywords ?? []) {
    if ((kw as Keyword).arg === name) return (kw as Keyword).value;
  }
  return undefined;
}

export function getPositionalArg(
  call: Call,
  index: number,
): ASTNodeUnion | undefined {
  return call.args?.[index];
}

export function getFunctionName(node: ASTNodeUnion): string | undefined {
  if (isNodeType(node, "FunctionDef") || isNodeType(node, "AsyncFunctionDef")) {
    return (node as FunctionDef).name;
  }
  return undefined;
}

export function getClassName(node: ASTNodeUnion): string | undefined {
  if (isNodeType(node, "ClassDef")) {
    return (node as ClassDef).name;
  }
  return undefined;
}

export function getLineNumber(node: ASTNodeUnion): number | undefined {
  const lineno = (node as { lineno?: number }).lineno;
  return typeof lineno === "number" ? lineno : undefined;
}

export function getDecoratorCalls(fn: FunctionDef): Call[] {
  const calls: Call[] = [];
  for (const dec of fn.decorator_list ?? []) {
    if (isNodeType(dec, "Call")) calls.push(dec as Call);
    else if (isNodeType(dec, "Attribute")) {
      calls.push({ type: "Call", func: dec, args: [], keywords: [] } as unknown as Call);
    }
  }
  return calls;
}

export function normalizePath(...parts: string[]): string {
  const joined = parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/");
  if (!joined.startsWith("/")) return `/${joined}`;
  return joined.replace(/\/$/, "") || "/";
}

export function flaskPathToOpenApi(path: string): string {
  return path
    .replace(/<(?:[^:>]+:)?([^>]+)>/g, "{$1}")
    .replace(/\/+/g, "/");
}

export function djangoPathToOpenApi(path: string): string {
  return path
    .replace(/<(?:[^:>]+:)?([^>]+)>/g, "{$1}")
    .replace(/\^|\$/g, "")
    .replace(/\/+/g, "/");
}

export const HTTP_METHODS = new Set([
  "get",
  "query",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
  "connect",
]);

export function isHttpMethod(name: string): boolean {
  return HTTP_METHODS.has(name.toLowerCase());
}

export function toHttpMethod(name: string): import("../../../models/endpoint").HttpMethod {
  return name.toUpperCase() as import("../../../models/endpoint").HttpMethod;
}
