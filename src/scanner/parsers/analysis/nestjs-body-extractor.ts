import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { ApiRequestBody } from "../../models/endpoint";
import type { ParsedSource } from "../ast/babel-parser";
import { traverseAst } from "../ast/babel-parser";
import { collectModuleBindings } from "./handler-bindings";
import { fieldsToRequestBodyFromSchema } from "./extractors";

export function extractNestMethodBody(
  member: t.ClassMethod | t.ClassProperty,
  parsed: ParsedSource,
  fileCache: Map<string, ParsedSource>,
  fileIndex: Set<string>,
): ApiRequestBody | undefined {
  if (!t.isClassMethod(member)) return undefined;

  const fromSwagger = extractApiBodyDecorator(member);
  if (fromSwagger) return fromSwagger;

  const fromFileUpload = extractFileInterceptorBody(member);
  if (fromFileUpload) return fromFileUpload;

  for (const param of member.params) {
    if (!hasDecorator(param, "Body")) continue;

    if (t.isIdentifier(param) && param.typeAnnotation) {
      const typeName = getTypeReferenceName(param.typeAnnotation);
      if (typeName) {
        const dtoBody = resolveDtoClass(
          typeName,
          parsed,
          fileCache,
          fileIndex,
        );
        if (dtoBody) return dtoBody;
      }
    }

    if (t.isObjectPattern(param)) {
      const fields = destructuredParamFields(param);
      if (Object.keys(fields).length > 0) {
        return fieldsToRequestBodyFromSchema(fields);
      }
    }
  }

  const methodName = t.isIdentifier(member.key) ? member.key.name : "";
  return inferBodyFromMethodName(methodName);
}

function hasDecorator(param: t.Node, name: string): boolean {
  if (!("decorators" in param) || !param.decorators) return false;
  return param.decorators.some((dec) => {
    if (!t.isDecorator(dec) || !t.isCallExpression(dec.expression)) {
      return false;
    }
    const callee = dec.expression.callee;
    return t.isIdentifier(callee) && callee.name === name;
  });
}

function getTypeReferenceName(
  annotation: t.TSTypeAnnotation | t.TypeAnnotation,
): string | null {
  const typeNode =
    "typeAnnotation" in annotation ? annotation.typeAnnotation : annotation;
  if (t.isTSTypeReference(typeNode) && t.isIdentifier(typeNode.typeName)) {
    return typeNode.typeName.name;
  }
  if (t.isTSTypeReference(typeNode) && t.isTSQualifiedName(typeNode.typeName)) {
    return typeNode.typeName.right.name;
  }
  return null;
}

function destructuredParamFields(
  pattern: t.ObjectPattern,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const prop of pattern.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      fields[prop.key.name] = "";
    } else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
      fields[prop.argument.name] = {};
    }
  }
  return fields;
}

function resolveDtoClass(
  className: string,
  parsed: ParsedSource,
  fileCache: Map<string, ParsedSource>,
  fileIndex: Set<string>,
): ApiRequestBody | undefined {
  const fromCurrent = extractClassSchema(parsed, className);
  if (fromCurrent) return fromCurrent;

  const bindings = collectModuleBindings(
    parsed,
    parsed.filePath,
    fileIndex,
  );

  for (const [, targetFile] of bindings) {
    const targetParsed = fileCache.get(targetFile);
    if (!targetParsed) continue;
    const fromImport = extractClassSchema(targetParsed, className);
    if (fromImport) return fromImport;
  }

  for (const source of fileCache.values()) {
    const fromAny = extractClassSchema(source, className);
    if (fromAny) return fromAny;
  }

  return undefined;
}

function extractClassSchema(
  parsed: ParsedSource,
  className: string,
): ApiRequestBody | undefined {
  let schema: Record<string, unknown> | null = null;

  traverseAst(parsed, {
    ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
      if (path.node.id?.name !== className) return;
      schema = extractClassProperties(path.node);
    },
    TSTypeAliasDeclaration(path: NodePath<t.TSTypeAliasDeclaration>) {
      if (path.node.id.name !== className) return;
      schema = extractTypeLiteralSchema(path.node.typeAnnotation);
    },
    TSInterfaceDeclaration(path: NodePath<t.TSInterfaceDeclaration>) {
      if (path.node.id.name !== className) return;
      schema = extractInterfaceSchema(path.node);
    },
  });

  if (schema && Object.keys(schema).length > 0) {
    return fieldsToRequestBodyFromSchema(schema);
  }

  return undefined;
}

function extractClassProperties(
  classDecl: t.ClassDeclaration,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {};

  for (const member of classDecl.body.body) {
    if (!t.isClassProperty(member) && !t.isClassPrivateProperty(member)) {
      continue;
    }

    const keyName = propertyKeyName(member.key);
    if (!keyName) continue;

    schema[keyName] = inferPropertyExample(member);
  }

  return schema;
}

function extractInterfaceSchema(
  iface: t.TSInterfaceDeclaration,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {};
  for (const member of iface.body.body) {
    if (!t.isTSPropertySignature(member)) continue;
    const keyName = propertyKeyName(member.key);
    if (!keyName) continue;
    schema[keyName] = inferTsTypeExample(member.typeAnnotation);
  }
  return schema;
}

function extractTypeLiteralSchema(
  typeNode: t.TSType,
): Record<string, unknown> | null {
  if (!t.isTSTypeLiteral(typeNode)) return null;
  const schema: Record<string, unknown> = {};
  for (const member of typeNode.members) {
    if (!t.isTSPropertySignature(member)) continue;
    const keyName = propertyKeyName(member.key);
    if (!keyName) continue;
    schema[keyName] = inferTsTypeExample(member.typeAnnotation);
  }
  return schema;
}

function propertyKeyName(key: t.Node): string | null {
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key)) return key.value;
  return null;
}

function inferPropertyExample(
  member: t.ClassProperty | t.ClassPrivateProperty,
): unknown {
  const decoratorHint = inferFromDecorators(member.decorators);
  if (decoratorHint !== undefined) return decoratorHint;
  return inferTsTypeExample(member.typeAnnotation);
}

function inferFromDecorators(
  decorators?: (t.Decorator | t.Expression)[] | null,
): unknown | undefined {
  if (!decorators) return undefined;

  for (const dec of decorators) {
    if (!t.isDecorator(dec) || !t.isCallExpression(dec.expression)) continue;
    const callee = dec.expression.callee;
    if (!t.isIdentifier(callee)) continue;

    switch (callee.name) {
      case "IsEmail":
        return "user@example.com";
      case "IsBoolean":
        return false;
      case "IsNumber":
      case "IsInt":
        return 0;
      case "IsArray":
        return [];
      case "IsString":
      case "IsNotEmpty":
      case "MinLength":
      case "MaxLength":
        return "";
      default:
        break;
    }
  }

  return undefined;
}

function inferTsTypeExample(
  annotation?: t.TSTypeAnnotation | t.TypeAnnotation | null,
): unknown {
  if (!annotation) return "";
  const typeNode =
    "typeAnnotation" in annotation ? annotation.typeAnnotation : annotation;

  if (t.isTSStringKeyword(typeNode)) return "";
  if (t.isTSNumberKeyword(typeNode)) return 0;
  if (t.isTSBooleanKeyword(typeNode)) return false;
  if (t.isTSArrayType(typeNode)) return [];
  if (t.isTSAnyKeyword(typeNode)) return "";
  if (t.isTSUnknownKeyword(typeNode)) return "";
  if (t.isTSTypeLiteral(typeNode)) {
    const nested = extractTypeLiteralSchema(typeNode);
    return nested ?? {};
  }

  return "";
}

function extractApiBodyDecorator(
  member: t.ClassMethod,
): ApiRequestBody | undefined {
  for (const dec of member.decorators ?? []) {
    if (!t.isDecorator(dec) || !t.isCallExpression(dec.expression)) continue;
    const callee = dec.expression.callee;
    if (!t.isIdentifier(callee) || callee.name !== "ApiBody") continue;

    const arg = dec.expression.arguments[0];
    if (!arg || !t.isObjectExpression(arg)) continue;

    const schema: Record<string, unknown> = {};
    for (const prop of arg.properties) {
      if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;
      if (prop.key.name === "schema" && t.isObjectExpression(prop.value)) {
        for (const schemaProp of prop.value.properties) {
          if (t.isObjectProperty(schemaProp) && t.isIdentifier(schemaProp.key)) {
            schema[schemaProp.key.name] = "";
          }
        }
      }
    }

    if (Object.keys(schema).length > 0) {
      return fieldsToRequestBodyFromSchema(schema);
    }
  }

  return undefined;
}

function extractFileInterceptorBody(
  member: t.ClassMethod,
): ApiRequestBody | undefined {
  for (const dec of member.decorators ?? []) {
    if (!t.isDecorator(dec) || !t.isCallExpression(dec.expression)) continue;
    const callee = dec.expression.callee;
    if (!t.isIdentifier(callee) || callee.name !== "UseInterceptors") continue;

    const arg = dec.expression.arguments[0];
    if (!arg || !t.isCallExpression(arg)) continue;

    const calleeName = t.isIdentifier(arg.callee)
      ? arg.callee.name
      : t.isMemberExpression(arg.callee) && t.isIdentifier(arg.callee.property)
        ? arg.callee.property.name
        : "";

    if (!/FileInterceptor|FilesInterceptor|AnyFilesInterceptor/i.test(calleeName)) {
      continue;
    }

    const fieldName =
      arg.arguments[0] && t.isStringLiteral(arg.arguments[0])
        ? arg.arguments[0].value
        : "file";

    return fieldsToRequestBodyFromSchema(
      { [fieldName]: "" },
      "multipart/form-data",
    );
  }

  return undefined;
}

function inferBodyFromMethodName(
  methodName: string,
): ApiRequestBody | undefined {
  const name = methodName.toLowerCase();

  const templates: Record<string, Record<string, unknown>> = {
    login: { email: "user@example.com", password: "" },
    register: { email: "user@example.com", password: "", name: "" },
    signup: { email: "user@example.com", password: "", name: "" },
    refresh: { refreshToken: "" },
    logout: { refreshToken: "" },
    forgotpassword: { email: "user@example.com" },
    resetpassword: { token: "", password: "" },
    google: { idToken: "" },
    sync: { deviceId: "", lastSyncAt: "" },
  };

  const schema = templates[name];
  if (!schema) return undefined;

  return fieldsToRequestBodyFromSchema(schema);
}
