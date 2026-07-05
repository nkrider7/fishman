import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { ApiMiddleware, ApiParameter, ApiRequestBody } from "../../models/endpoint";
import {
  traverseAst,
  type ParsedSource,
} from "../ast/babel-parser";

const AUTH_MIDDLEWARE_PATTERNS = [
  /^auth(enticate|orization)?$/i,
  /^verifyToken$/i,
  /jwt/i,
  /^passport/i,
  /^requireAuth$/i,
  /^isAuthenticated$/i,
  /^protect$/i,
  /^ensureLoggedIn$/i,
];

const UPLOAD_PATTERNS = [/upload/i, /multer/i, /formidable/i, /busboy/i];

export function extractMiddlewareNames(
  args: t.Expression[],
  startIndex = 1,
): ApiMiddleware[] {
  const middleware: ApiMiddleware[] = [];
  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    if (t.isIdentifier(arg)) {
      const name = arg.name;
      let type: ApiMiddleware["type"] = "other";
      if (AUTH_MIDDLEWARE_PATTERNS.some((p) => p.test(name))) type = "auth";
      else if (UPLOAD_PATTERNS.some((p) => p.test(name))) type = "upload";
      else if (/validate|validation|schema/i.test(name)) type = "validation";
      else if (/cors/i.test(name)) type = "cors";
      else if (/rate.?limit/i.test(name)) type = "rate-limit";
      else if (/log/i.test(name)) type = "logging";
      middleware.push({ name, type });
    } else if (t.isMemberExpression(arg) && t.isIdentifier(arg.property)) {
      middleware.push({ name: arg.property.name, type: "other" });
    } else if (t.isCallExpression(arg)) {
      const name = getMiddlewareCallName(arg);
      let type: ApiMiddleware["type"] = "other";
      if (name && AUTH_MIDDLEWARE_PATTERNS.some((p) => p.test(name))) {
        type = "auth";
      } else if (name && UPLOAD_PATTERNS.some((p) => p.test(name))) {
        type = "upload";
      } else if (name && /validate|validation|schema/i.test(name)) {
        type = "validation";
      } else if (name && /cors/i.test(name)) {
        type = "cors";
      } else if (name && /rate.?limit/i.test(name)) {
        type = "rate-limit";
      } else if (name && /log/i.test(name)) {
        type = "logging";
      }
      middleware.push({ name: name ?? "middleware", type });
    }
  }
  return middleware;
}

function getMiddlewareCallName(call: t.CallExpression): string | null {
  const callee = call.callee;
  if (t.isIdentifier(callee)) return callee.name;
  if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
    const obj = t.isIdentifier(callee.object) ? callee.object.name : "";
    return obj ? `${obj}.${callee.property.name}` : callee.property.name;
  }
  return null;
}

export function detectAuthFromMiddleware(
  middleware: ApiMiddleware[],
): { type: "bearer" | "basic" | "session" | "custom"; required: boolean } | null {
  const authMw = middleware.filter((m) => m.type === "auth");
  if (authMw.length === 0) return null;
  const names = authMw.map((m) => m.name.toLowerCase()).join(" ");
  if (names.includes("jwt") || names.includes("bearer") || names.includes("token")) {
    return { type: "bearer", required: true };
  }
  if (names.includes("session")) return { type: "session", required: true };
  if (names.includes("basic")) return { type: "basic", required: true };
  return { type: "custom", required: true };
}

export function extractBodyFromHandler(
  parsed: ParsedSource,
  handlerArg: t.Expression,
): ApiRequestBody | undefined {
  let inlineResult:
    | { fields: Record<string, string>; hasBodyAccess: boolean }
    | undefined;

  traverseAst(parsed, {
    enter(path) {
      if (path.node !== handlerArg) return;
      if (
        path.isArrowFunctionExpression() ||
        path.isFunctionExpression() ||
        path.isFunctionDeclaration()
      ) {
        inlineResult = scanFunctionPath(path);
        path.stop();
      }
    },
  });

  if (inlineResult) {
    return fieldsToRequestBody(
      inlineResult.fields,
      inlineResult.hasBodyAccess,
    );
  }

  if (t.isMemberExpression(handlerArg) && t.isIdentifier(handlerArg.property)) {
    const methodName = handlerArg.property.name;
    if (t.isIdentifier(handlerArg.object)) {
      const fromObject = findMethodOnBoundObject(
        parsed,
        handlerArg.object.name,
        methodName,
      );
      if (fromObject) return fromObject;
    }
    const byName = extractBodyByFunctionName(parsed, methodName);
    if (byName) return byName;
  }

  const handlerName = t.isIdentifier(handlerArg)
    ? handlerArg.name
    : t.isMemberExpression(handlerArg) && t.isIdentifier(handlerArg.property)
      ? handlerArg.property.name
      : null;

  if (!handlerName) return undefined;

  let bodyFields: Record<string, string> = {};
  let hasBodyAccess = false;

  const merge = (fields: Record<string, string>, found: boolean) => {
    bodyFields = { ...bodyFields, ...fields };
    if (found) hasBodyAccess = true;
  };

  traverseAst(parsed, {
    FunctionDeclaration(path) {
      const id = path.node.id;
      if (!id || id.name !== handlerName) return;
      const result = scanFunctionPath(path);
      merge(result.fields, result.hasBodyAccess);
    },
    FunctionExpression(path) {
      const id = path.node.id;
      if (!id || id.name !== handlerName) return;
      const result = scanFunctionPath(path);
      merge(result.fields, result.hasBodyAccess);
    },
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isIdentifier(path.node.id) || path.node.id.name !== handlerName) {
        return;
      }
      const init = path.node.init;
      if (
        t.isArrowFunctionExpression(init) ||
        t.isFunctionExpression(init)
      ) {
        const initPath = path.get("init") as NodePath<
          t.ArrowFunctionExpression | t.FunctionExpression
        >;
        const result = scanFunctionPath(initPath);
        merge(result.fields, result.hasBodyAccess);
      }
    },
  });

  return fieldsToRequestBody(bodyFields, hasBodyAccess);
}

export function extractBodyByFunctionName(
  parsed: ParsedSource,
  functionName: string,
): ApiRequestBody | undefined {
  let result: ApiRequestBody | undefined;

  traverseAst(parsed, {
    FunctionDeclaration(path) {
      if (path.node.id?.name !== functionName) return;
      result = bodyFromFunctionPath(path);
    },
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isIdentifier(path.node.id) || path.node.id.name !== functionName) {
        return;
      }
      const init = path.node.init;
      if (
        t.isArrowFunctionExpression(init) ||
        t.isFunctionExpression(init)
      ) {
        result = bodyFromFunctionPath(
          path.get("init") as NodePath<
            t.ArrowFunctionExpression | t.FunctionExpression
          >,
        );
      }
    },
    ClassMethod(path: NodePath<t.ClassMethod>) {
      if (t.isIdentifier(path.node.key) && path.node.key.name === functionName) {
        result = bodyFromFunctionPath(path);
      }
    },
    ClassProperty(path: NodePath<t.ClassProperty>) {
      if (!t.isIdentifier(path.node.key) || path.node.key.name !== functionName) {
        return;
      }
      const value = path.node.value;
      if (
        t.isArrowFunctionExpression(value) ||
        t.isFunctionExpression(value)
      ) {
        result = bodyFromFunctionPath(
          path.get("value") as NodePath<
            t.ArrowFunctionExpression | t.FunctionExpression
          >,
        );
      }
    },
    ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
      const decl = path.node.declaration;
      if (t.isFunctionDeclaration(decl) && decl.id?.name === functionName) {
        result = bodyFromFunctionPath(path.get("declaration") as NodePath<t.FunctionDeclaration>);
      }
    },
  });

  if (result) return result;
  return extractFromModuleExports(parsed, functionName);
}

function findMethodOnBoundObject(
  parsed: ParsedSource,
  objectName: string,
  methodName: string,
): ApiRequestBody | undefined {
  let result: ApiRequestBody | undefined;

  traverseAst(parsed, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isIdentifier(path.node.id) || path.node.id.name !== objectName) {
        return;
      }
      const init = path.node.init;
      if (!t.isObjectExpression(init)) return;

      for (let i = 0; i < init.properties.length; i++) {
        const prop = init.properties[i];
        if (
          t.isObjectProperty(prop) &&
          t.isIdentifier(prop.key) &&
          prop.key.name === methodName
        ) {
          const valuePath = path.get(`init.properties.${i}.value`);
          if (
            valuePath.isArrowFunctionExpression() ||
            valuePath.isFunctionExpression()
          ) {
            result = bodyFromFunctionPath(
              valuePath as NodePath<
                t.ArrowFunctionExpression | t.FunctionExpression
              >,
            );
          }
        }
      }
    },
  });

  if (result) return result;
  return extractBodyByFunctionName(parsed, methodName);
}

function extractFromModuleExports(
  parsed: ParsedSource,
  methodName: string,
): ApiRequestBody | undefined {
  let result: ApiRequestBody | undefined;

  const scanObjectMethod = (obj: t.ObjectExpression) => {
    for (let i = 0; i < obj.properties.length; i++) {
      const prop = obj.properties[i];
      if (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === methodName &&
        (t.isArrowFunctionExpression(prop.value) ||
          t.isFunctionExpression(prop.value))
      ) {
        result = bodyFromFunctionPath(
          { node: prop.value } as NodePath<t.ArrowFunctionExpression>,
        );
      }
    }
  };

  traverseAst(parsed, {
    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      const decl = path.node.declaration;
      if (t.isObjectExpression(decl)) scanObjectMethod(decl);
      if (
        t.isNewExpression(decl) &&
        t.isIdentifier(decl.callee)
      ) {
        const className = decl.callee.name;
        traverseAst(parsed, {
          ClassDeclaration(classPath: NodePath<t.ClassDeclaration>) {
            if (classPath.node.id?.name !== className) return;
            for (const bodyPath of classPath.get("body.body")) {
              if (
                bodyPath.isClassMethod() &&
                t.isIdentifier(bodyPath.node.key) &&
                bodyPath.node.key.name === methodName
              ) {
                result = bodyFromFunctionPath(bodyPath);
              }
              if (
                bodyPath.isClassProperty() &&
                t.isIdentifier(bodyPath.node.key) &&
                bodyPath.node.key.name === methodName
              ) {
                const valuePath = bodyPath.get("value");
                if (
                  valuePath.isArrowFunctionExpression() ||
                  valuePath.isFunctionExpression()
                ) {
                  result = bodyFromFunctionPath(valuePath);
                }
              }
            }
          },
        });
      }
    },
    AssignmentExpression(path: NodePath<t.AssignmentExpression>) {
      const left = path.node.left;
      if (
        t.isMemberExpression(left) &&
        t.isIdentifier(left.object) &&
        left.object.name === "module" &&
        t.isIdentifier(left.property) &&
        left.property.name === "exports" &&
        t.isObjectExpression(path.node.right)
      ) {
        scanObjectMethod(path.node.right);
      }
      if (
        t.isMemberExpression(left) &&
        t.isIdentifier(left.property) &&
        left.property.name === methodName &&
        (t.isArrowFunctionExpression(path.node.right) ||
          t.isFunctionExpression(path.node.right))
      ) {
        result = bodyFromFunctionPath(
          { node: path.node.right } as NodePath<t.ArrowFunctionExpression>,
        );
      }
    },
  });

  return result;
}

export function bodyFromFunctionPath(path: FunctionLikePath): ApiRequestBody | undefined {
  const { fields, hasBodyAccess } = scanFunctionPath(path);
  return fieldsToRequestBody(fields, hasBodyAccess);
}

type FunctionLikePath = NodePath<
  | t.ArrowFunctionExpression
  | t.FunctionExpression
  | t.FunctionDeclaration
  | t.ClassMethod
>;

function scanFunctionPath(path: FunctionLikePath): {
  fields: Record<string, string>;
  hasBodyAccess: boolean;
} {
  const fields: Record<string, string> = {};
  let hasBodyAccess = false;

  path.traverse({
    VariableDeclarator(inner: NodePath<t.VariableDeclarator>) {
      const init = inner.node.init;
      if (!init) return;

      if (t.isObjectPattern(inner.node.id) && isBodyAccess(init)) {
        hasBodyAccess = true;
        collectDestructuredFields(inner.node.id, fields);
        return;
      }

      if (t.isIdentifier(inner.node.id)) {
        const memberField = getBodyMemberFieldName(init);
        if (memberField) {
          hasBodyAccess = true;
          fields[memberField] = "string";
        }
      }
    },
    MemberExpression(inner: NodePath<t.MemberExpression>) {
      const memberField = getBodyMemberFieldName(inner.node);
      if (memberField) {
        hasBodyAccess = true;
        fields[memberField] = "string";
        return;
      }
      if (isBodyAccess(inner.node)) {
        hasBodyAccess = true;
      }
    },
  });

  return { fields, hasBodyAccess };
}

function collectDestructuredFields(
  pattern: t.ObjectPattern,
  fields: Record<string, string>,
): void {
  for (const prop of pattern.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      fields[prop.key.name] = "string";
    } else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
      fields[prop.argument.name] = "object";
    }
  }
}

function getBodyMemberFieldName(node: t.Node): string | null {
  if (!t.isMemberExpression(node) || !t.isIdentifier(node.property)) {
    return null;
  }
  if (isBodyAccess(node.object)) {
    return node.property.name;
  }
  return null;
}

export function fieldsToRequestBodyFromSchema(
  schema: Record<string, unknown>,
  contentType = "application/json",
): ApiRequestBody {
  return {
    contentType,
    schema,
    example: JSON.stringify(schema, null, 2),
  };
}

function fieldsToRequestBody(
  fields: Record<string, string>,
  hasBodyAccess: boolean,
): ApiRequestBody | undefined {
  if (Object.keys(fields).length > 0) {
    const schema: Record<string, unknown> = {};
    for (const [key, type] of Object.entries(fields)) {
      schema[key] = type === "object" ? {} : "";
    }
    return {
      contentType: "application/json",
      schema,
      example: JSON.stringify(schema, null, 2),
    };
  }

  if (hasBodyAccess) {
    return {
      contentType: "application/json",
      schema: {},
      example: "{}",
    };
  }

  return undefined;
}

function isBodyAccess(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    t.isIdentifier(node.property) &&
    node.property.name === "body" &&
    t.isIdentifier(node.object) &&
    ["req", "request", "ctx"].includes(node.object.name)
  );
}


export function extractZodSchemaBody(
  parsed: ParsedSource,
  schemaName: string,
): ApiRequestBody | undefined {
  let result: ApiRequestBody | undefined;

  const tryName = (name: string) => {
    if (result) return;
    traverseAst(parsed, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (!t.isIdentifier(path.node.id) || path.node.id.name !== name) return;
        const fields = extractSchemaShape(path.node.init);
        if (fields && Object.keys(fields).length > 0) {
          result = fieldsToRequestBodyFromSchema(fields);
        }
      },
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
        const decl = path.node.declaration;
        if (!decl || !t.isVariableDeclaration(decl)) return;
        for (const d of decl.declarations) {
          if (!t.isIdentifier(d.id) || d.id.name !== name) continue;
          const fields = extractSchemaShape(d.init);
          if (fields && Object.keys(fields).length > 0) {
            result = fieldsToRequestBodyFromSchema(fields);
          }
        }
      },
      FunctionDeclaration(path) {
        if (path.node.id?.name !== name) return;
        // skip functions
      },
    });
  };

  tryName(schemaName);
  if (!schemaName.endsWith("Schema")) tryName(`${schemaName}Schema`);
  if (!schemaName.endsWith("Validator")) tryName(`${schemaName}Validator`);

  return result;
}

export function extractZodShape(
  node: t.Node | null | undefined,
): Record<string, unknown> | null {
  if (!node) return null;
  if (t.isCallExpression(node) && t.isMemberExpression(node.callee)) {
    const method = t.isIdentifier(node.callee.property)
      ? node.callee.property.name
      : "";
    if (method === "object" && node.arguments[0] && t.isObjectExpression(node.arguments[0])) {
      const shape: Record<string, unknown> = {};
      for (const prop of node.arguments[0].properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
          shape[prop.key.name] = inferSchemaType(prop.value);
        }
      }
      return shape;
    }
  }
  return null;
}

export function extractJoiShape(
  node: t.Node | null | undefined,
): Record<string, unknown> | null {
  return extractZodShape(node);
}

export function extractSchemaShape(
  node: t.Node | null | undefined,
): Record<string, unknown> | null {
  return extractZodShape(node) ?? extractJoiShape(node);
}

function inferSchemaType(node: t.Node): unknown {
  if (!t.isCallExpression(node) || !t.isMemberExpression(node.callee)) return "";
  const type = t.isIdentifier(node.callee.property)
    ? node.callee.property.name
    : "";
  switch (type) {
    case "string": return "";
    case "number": return 0;
    case "boolean": return false;
    case "array": return [];
    case "object": return {};
    case "email": return "user@example.com";
    case "optional": return node.arguments[0] ? inferSchemaType(node.arguments[0]) : "";
    default: return "";
  }
}

export function resolveHandlerName(arg: t.Expression): string | null {
  if (t.isIdentifier(arg)) return arg.name;
  if (t.isMemberExpression(arg) && t.isIdentifier(arg.property)) {
    const obj = t.isIdentifier(arg.object) ? arg.object.name : "controller";
    return `${obj}.${arg.property.name}`;
  }
  return null;
}

export function buildPathParameters(path: string): ApiParameter[] {
  const regex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const params: ApiParameter[] = [];
  let match;
  while ((match = regex.exec(path)) !== null) {
    params.push({
      name: match[1],
      in: "path",
      required: true,
      example: match[1] === "id" ? "1" : "",
    });
  }
  return params;
}

export {
  parseSource,
  findImports,
  getStringLiteral,
  getIdentifierName,
  traverseAst,
  isHttpMethod,
  toHttpMethod,
  normalizeRoutePath,
} from "../ast/babel-parser";
