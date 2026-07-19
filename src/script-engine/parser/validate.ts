import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";
import type { ScriptError } from "../types";

const FORBIDDEN_IDENTIFIERS = new Set([
  "process",
  "require",
  "eval",
  "Function",
  "globalThis",
  "window",
  "document",
  "importScripts",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "SharedArrayBuffer",
  "Atomics",
  "Deno",
  "Bun",
  "__dirname",
  "__filename",
  "module",
  "exports",
]);

const FORBIDDEN_MEMBER_OBJECTS = new Set([
  "process",
  "global",
  "globalThis",
  "window",
  "document",
  "Deno",
  "Bun",
  "Tauri",
  "__TAURI__",
]);

export interface ValidationResult {
  valid: boolean;
  error?: ScriptError;
}

export function validateScript(source: string): ValidationResult {
  if (!source.trim()) {
    return { valid: true };
  }

  let ast;
  try {
    ast = babelParser.parse(source, {
      sourceType: "unambiguous",
      plugins: ["typescript"],
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    });
  } catch (error) {
    const err = error as { message?: string; loc?: { line: number; column: number } };
    return {
      valid: false,
      error: {
        message: err.message ?? "Syntax error",
        line: err.loc?.line,
        column: err.loc?.column,
      },
    };
  }

  let validationError: ScriptError | undefined;

  traverse(ast, {
    Identifier(path) {
      if (validationError) return;
      if (path.node.name === "eval" || path.node.name === "Function") {
        validationError = {
          message: `Forbidden identifier: ${path.node.name}`,
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column,
        };
        return;
      }
      if (
        path.isReferencedIdentifier() &&
        FORBIDDEN_IDENTIFIERS.has(path.node.name)
      ) {
        validationError = {
          message: `Forbidden identifier: ${path.node.name}`,
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column,
        };
      }
    },
    MemberExpression(path) {
      if (validationError) return;
      if (path.node.object.type === "Identifier") {
        const name = path.node.object.name;
        if (FORBIDDEN_MEMBER_OBJECTS.has(name)) {
          validationError = {
            message: `Forbidden access: ${name}`,
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column,
          };
        }
      }
    },
    ImportDeclaration() {
      validationError = {
        message: "Import statements are not allowed in scripts",
      };
    },
    CallExpression(path) {
      if (validationError) return;
      if (
        path.node.callee.type === "Identifier" &&
        path.node.callee.name === "eval"
      ) {
        validationError = {
          message: "eval() is not allowed",
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column,
        };
      }
    },
  });

  if (validationError) {
    return { valid: false, error: validationError };
  }

  return { valid: true };
}
