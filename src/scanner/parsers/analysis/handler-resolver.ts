import * as t from "@babel/types";
import type { ApiRequestBody } from "../../models/endpoint";
import {
  extractBodyByFunctionName,
  extractBodyFromHandler,
  extractSchemaShape,
  extractZodSchemaBody,
  fieldsToRequestBodyFromSchema,
} from "./extractors";
import { collectModuleBindings } from "./handler-bindings";
import { parseSource, type ParsedSource } from "../ast/babel-parser";

export { collectModuleBindings };

export function parseFileToCache(
  code: string,
  relativePath: string,
): ParsedSource | null {
  return parseSource(code, relativePath);
}

export function unwrapHandlerArg(handlerArg: t.Expression): t.Expression {
  if (!t.isCallExpression(handlerArg)) return handlerArg;

  const calleeName = getCalleeName(handlerArg.callee);
  if (
    calleeName &&
    /asyncHandler|catchAsync|wrapAsync|asyncMiddleware|handleAsync/i.test(
      calleeName,
    )
  ) {
    const inner = handlerArg.arguments[0];
    if (inner && t.isExpression(inner)) return unwrapHandlerArg(inner);
  }

  if (
    t.isMemberExpression(handlerArg.callee) &&
    t.isIdentifier(handlerArg.callee.property) &&
    handlerArg.callee.property.name === "bind"
  ) {
    const object = handlerArg.callee.object;
    if (t.isExpression(object)) return unwrapHandlerArg(object);
  }

  return handlerArg;
}

export function resolveHandlerBody(
  routeParsed: ParsedSource,
  handlerArg: t.Expression,
  fileCache: Map<string, ParsedSource>,
  fileIndex: Set<string>,
): ApiRequestBody | undefined {
  const unwrapped = unwrapHandlerArg(handlerArg);
  const local = extractBodyFromHandler(routeParsed, unwrapped);
  if (local) return local;

  if (t.isIdentifier(unwrapped)) {
    const bindings = collectModuleBindings(
      routeParsed,
      routeParsed.filePath,
      fileIndex,
    );
    const targetFile = bindings.get(unwrapped.name);
    if (targetFile) {
      const targetParsed = fileCache.get(targetFile);
      if (targetParsed) {
        return (
          extractBodyFromHandler(targetParsed, unwrapped) ??
          extractBodyByFunctionName(targetParsed, unwrapped.name)
        );
      }
    }
    return searchMethodInCache(fileCache, unwrapped.name);
  }

  if (t.isMemberExpression(unwrapped) && t.isIdentifier(unwrapped.property)) {
    const methodName = unwrapped.property.name;

    if (t.isIdentifier(unwrapped.object)) {
      const objectName = unwrapped.object.name;
      const bindings = collectModuleBindings(
        routeParsed,
        routeParsed.filePath,
        fileIndex,
      );
      const targetFile = bindings.get(objectName);
      if (targetFile) {
        const targetParsed = fileCache.get(targetFile);
        if (targetParsed) {
          const fromTarget = extractBodyByFunctionName(targetParsed, methodName);
          if (fromTarget) return fromTarget;
        }
      }
    }

    const fromRouteFile = extractBodyByFunctionName(routeParsed, methodName);
    if (fromRouteFile) return fromRouteFile;

    return searchMethodInCache(fileCache, methodName);
  }

  return undefined;
}

function searchMethodInCache(
  fileCache: Map<string, ParsedSource>,
  methodName: string,
): ApiRequestBody | undefined {
  for (const parsed of fileCache.values()) {
    const body = extractBodyByFunctionName(parsed, methodName);
    if (body) return body;
  }
  return undefined;
}

export function extractZodFromMiddlewareArgs(
  parsed: ParsedSource,
  args: t.Expression[],
  fileCache?: Map<string, ParsedSource>,
): ApiRequestBody | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (t.isIdentifier(arg)) {
      const direct = extractZodSchemaBody(parsed, arg.name);
      if (direct) return direct;

      if (fileCache) {
        for (const cached of fileCache.values()) {
          const fromCache = extractZodSchemaBody(cached, arg.name);
          if (fromCache) return fromCache;
        }
      }

      for (const alias of schemaNameAliases(arg.name)) {
        const body = extractZodSchemaBody(parsed, alias);
        if (body) return body;
      }
      continue;
    }

    if (t.isCallExpression(arg)) {
      const calleeName = getCalleeName(arg.callee);

      if (calleeName && /celebrate/i.test(calleeName)) {
        const fromCelebrate = extractCelebrateBody(arg);
        if (fromCelebrate) return fromCelebrate;
      }

      if (calleeName && /validate|validation|schema|body/i.test(calleeName)) {
        for (const param of arg.arguments) {
          if (t.isExpression(param)) {
            const fromArg = extractSchemaFromNode(parsed, param, fileCache);
            if (fromArg) return fromArg;
          }
        }
      }

      if (
        calleeName &&
        (/upload|multer|formidable|busboy/i.test(calleeName) ||
          /single|array|fields|any/i.test(calleeName))
      ) {
        return extractMultipartFromUploadCall(arg);
      }
    }
  }

  return undefined;
}

function extractCelebrateBody(call: t.CallExpression): ApiRequestBody | undefined {
  const first = call.arguments[0];
  if (!first || !t.isObjectExpression(first)) return undefined;

  for (const prop of first.properties) {
    if (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key) &&
      prop.key.name === "body" &&
      t.isExpression(prop.value)
    ) {
      const shape = extractSchemaShape(prop.value);
      if (shape && Object.keys(shape).length > 0) {
        return fieldsToRequestBodyFromSchema(shape);
      }
    }
  }

  return undefined;
}

function extractSchemaFromNode(
  parsed: ParsedSource,
  node: t.Expression,
  fileCache?: Map<string, ParsedSource>,
): ApiRequestBody | undefined {
  if (t.isIdentifier(node)) {
    const direct = extractZodSchemaBody(parsed, node.name);
    if (direct) return direct;

    if (fileCache) {
      for (const cached of fileCache.values()) {
        const fromCache = extractZodSchemaBody(cached, node.name);
        if (fromCache) return fromCache;
      }
    }

    for (const alias of schemaNameAliases(node.name)) {
      const body = extractZodSchemaBody(parsed, alias);
      if (body) return body;
    }
    return undefined;
  }

  if (t.isObjectExpression(node)) {
    const shape: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
        shape[prop.key.name] = "";
      }
    }
    if (Object.keys(shape).length > 0) {
      return fieldsToRequestBodyFromSchema(shape);
    }
  }

  const shape = extractSchemaShape(node);
  if (shape && Object.keys(shape).length > 0) {
    return fieldsToRequestBodyFromSchema(shape);
  }

  return undefined;
}

function schemaNameAliases(name: string): string[] {
  const aliases = new Set<string>([name]);

  const stripped = name
    .replace(/^validate/i, "")
    .replace(/Middleware$/i, "")
    .replace(/Validator$/i, "")
    .replace(/Schema$/i, "");
  if (stripped && stripped !== name) {
    aliases.add(stripped);
    aliases.add(`${stripped}Schema`);
    aliases.add(`${stripped}Validator`);
    aliases.add(
      `validate${stripped.charAt(0).toUpperCase()}${stripped.slice(1)}`,
    );
  }

  if (!name.endsWith("Schema")) aliases.add(`${name}Schema`);
  if (!name.endsWith("Validator")) aliases.add(`${name}Validator`);

  return Array.from(aliases);
}

function getCalleeName(
  callee: t.CallExpression["callee"],
): string {
  if (t.isIdentifier(callee)) return callee.name;
  if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
    return callee.property.name;
  }
  return "";
}

function extractMultipartFromUploadCall(
  call: t.CallExpression,
): ApiRequestBody {
  const fields: Record<string, unknown> = {};
  const fieldName = getStringArg(call.arguments[0]) ?? "file";
  fields[fieldName] = "";

  const arg0 = call.arguments[0];
  if (arg0 && t.isArrayExpression(arg0)) {
    for (const el of arg0.elements) {
      if (el && t.isObjectExpression(el)) {
        for (const prop of el.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            fields[prop.key.name] = "";
          }
        }
      }
    }
  }

  return fieldsToRequestBodyFromSchema(fields, "multipart/form-data");
}

function getStringArg(node: t.Node | null | undefined): string | null {
  if (!node) return null;
  if (t.isStringLiteral(node)) return node.value;
  return null;
}
