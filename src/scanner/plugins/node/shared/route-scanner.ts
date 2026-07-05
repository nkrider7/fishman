import type { ApiEndpoint, HttpMethod } from "../../../models/endpoint";
import type { ScanContext } from "../../../core/types";
import { discoverSourceFiles } from "../../../utils/file-discovery";
import {
  buildPathParameters,
  detectAuthFromMiddleware,
  extractMiddlewareNames,
  extractZodSchemaBody,
  getStringLiteral,
  isHttpMethod,
  normalizeRoutePath,
  parseSource,
  resolveHandlerName,
  toHttpMethod,
  traverseAst,
} from "../../../parsers/analysis/extractors";
import {
  extractZodFromMiddlewareArgs,
  parseFileToCache,
  resolveHandlerBody,
  unwrapHandlerArg,
} from "../../../parsers/analysis/handler-resolver";
import {
  inferBodyFromHandlerName,
  inferBodyFromRoutePath,
} from "../../../parsers/analysis/express-body-templates";
import * as t from "@babel/types";
import type { NodePath } from "@babel/traverse";
import { generateId } from "@/utils/id";
import { buildGlobalMountMap } from "./mount-resolver";

export interface RouteCallPattern {
  /** Object names: router, app, fastify, server, etc. */
  receivers: string[];
  /** Also match CallExpression where callee is identifier (Hono) */
  allowBareCalls?: boolean;
}

const DEFAULT_RECEIVERS = [
  "router",
  "app",
  "server",
  "fastify",
  "api",
  "route",
  "routes",
  "hono",
  "elysia",
];

export async function scanWithRoutePatterns(
  ctx: ScanContext,
  frameworkId: string,
  pattern: RouteCallPattern,
  extraDetect?: (code: string) => boolean,
): Promise<ApiEndpoint[]> {
  const endpoints: ApiEndpoint[] = [];
  const files = await discoverSourceFiles(ctx.fs, ctx.projectPath, {
    maxFiles: ctx.options.maxFiles,
    includePatterns: ctx.options.includePatterns,
    excludePatterns: ctx.options.excludePatterns,
  });

  if (files.length === 0) {
    ctx.onProgress?.({
      stage: "discovering-files",
      message: "No source files found in project",
      percent: 90,
      routesFound: 0,
    });
    return endpoints;
  }

  const receivers = new Set([...DEFAULT_RECEIVERS, ...pattern.receivers]);
  const globalMounts = await buildGlobalMountMap(ctx.fs, files);
  const fileIndex = new Set(files.map((f) => f.relativePath.replace(/\\/g, "/")));
  const fileCache = new Map<string, NonNullable<ReturnType<typeof parseSource>>>();
  let processed = 0;

  for (const file of files) {
    processed++;
    ctx.onProgress?.({
      stage: "parsing",
      message: `Parsing ${file.relativePath}`,
      percent: Math.min(90, Math.round((processed / files.length) * 80)),
      filesProcessed: processed,
      totalFiles: files.length,
      routesFound: endpoints.length,
    });

    let code: string;
    try {
      code = await ctx.fs.readFile(file.absolutePath);
    } catch {
      continue;
    }

    if (extraDetect && !extraDetect(code)) continue;

    const relFile = file.relativePath.replace(/\\/g, "/");
    const parsed = parseFileToCache(code, relFile);
    if (!parsed) continue;
    fileCache.set(relFile, parsed);
  }

  for (const file of files) {
    const relFile = file.relativePath.replace(/\\/g, "/");
    const parsed = fileCache.get(relFile);
    if (!parsed) continue;

    const routePrefixes = extractRoutePrefixes(parsed);
    const mountPrefixes = extractMountPrefixes(parsed, receivers);

    traverseAst(parsed, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const routeCall = parseRouteCall(path.node, pattern);
        if (!routeCall) return;

        const { method, receiver, routePath, routeArgs, middlewareStartIndex } =
          routeCall;

        const globalPrefix = globalMounts.get(relFile) ?? "";
        const localMount = mountPrefixes.get(receiver) ?? "";
        const routerPrefix = routePrefixes.get(receiver) ?? "";
        const fullPath = normalizeRoutePath(
          routePath,
          globalPrefix + localMount + routerPrefix,
        );
        const middleware = extractMiddlewareNames(routeArgs, middlewareStartIndex);
        const auth = detectAuthFromMiddleware(middleware);
        const handlerArg = routeArgs[routeArgs.length - 1];

        let requestBody =
          extractZodFromMiddlewareArgs(parsed, routeArgs, fileCache) ?? undefined;

        const validationMw = middleware.find((m) => m.type === "validation");
        if (validationMw) {
          const zodBody = extractZodSchemaBody(parsed, validationMw.name);
          if (zodBody) requestBody = zodBody;
        }

        if (!requestBody && handlerArg && t.isExpression(handlerArg)) {
          requestBody = resolveHandlerBody(
            parsed,
            handlerArg,
            fileCache,
            fileIndex,
          );
        }

        const uploadMw = middleware.find((m) => m.type === "upload");
        if (uploadMw && !requestBody) {
          requestBody = {
            contentType: "multipart/form-data",
            schema: { file: "" },
            example: JSON.stringify({ file: "" }, null, 2),
          };
        }

        if (
          !requestBody &&
          ["post", "put", "patch"].includes(method)
        ) {
          const unwrapped =
            handlerArg && t.isExpression(handlerArg)
              ? unwrapHandlerArg(handlerArg)
              : null;
          requestBody =
            inferBodyFromRoutePath(fullPath) ??
            inferBodyFromHandlerName(
              unwrapped && t.isMemberExpression(unwrapped) && t.isIdentifier(unwrapped.property)
                ? unwrapped.property.name
                : unwrapped && t.isIdentifier(unwrapped)
                  ? unwrapped.name
                  : null,
            );
        }

        const handler =
          handlerArg && t.isExpression(handlerArg)
            ? resolveHandlerName(unwrapHandlerArg(handlerArg))
            : null;

        const folder = deriveFolder(file.relativePath, fullPath);
        const name = deriveEndpointName(fullPath);

        endpoints.push({
          id: generateId(),
          name,
          method: toHttpMethod(method) as HttpMethod,
          path: fullPath,
          description: `Scanned from ${file.relativePath}`,
          tags: [frameworkId, ...folder],
          folder,
          headers: [],
          authentication: auth
            ? {
                type: auth.type,
                required: auth.required,
                middleware: middleware.filter((m) => m.type === "auth").map((m) => m.name),
              }
            : undefined,
          queryParameters: [],
          pathParameters: buildPathParameters(fullPath),
          requestBody,
          responses: [{ statusCode: method === "post" ? 201 : 200 }],
          middleware,
          sourceFile: file.relativePath,
          handler: handler ?? undefined,
          lineNumber: path.node.loc?.start.line,
          framework: frameworkId,
          warnings: [],
        });
      },
    });
  }

  return dedupeEndpoints(endpoints);
}

function parseRouteCall(
  node: t.CallExpression,
  pattern: RouteCallPattern,
): {
  method: string;
  receiver: string;
  routePath: string;
  routeArgs: t.Expression[];
  middlewareStartIndex: number;
} | null {
  const callee = node.callee;

  if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
    const propName = callee.property.name.toLowerCase();
    if (!isHttpMethod(propName)) return null;

    if (t.isIdentifier(callee.object)) {
      const routePath = getStringLiteral(node.arguments[0]);
      if (!routePath) return null;
      return {
        method: propName,
        receiver: callee.object.name,
        routePath,
        routeArgs: node.arguments.filter(
          (arg): arg is t.Expression => t.isExpression(arg),
        ),
        middlewareStartIndex: 1,
      };
    }

    if (
      t.isCallExpression(callee.object) &&
      t.isMemberExpression(callee.object.callee) &&
      t.isIdentifier(callee.object.callee.property) &&
      callee.object.callee.property.name === "route" &&
      t.isIdentifier(callee.object.callee.object)
    ) {
      const routePath = getStringLiteral(callee.object.arguments[0]);
      if (!routePath) return null;
      return {
        method: propName,
        receiver: callee.object.callee.object.name,
        routePath,
        routeArgs: node.arguments.filter(
          (arg): arg is t.Expression => t.isExpression(arg),
        ),
        middlewareStartIndex: 0,
      };
    }
  }

  if (
    pattern.allowBareCalls &&
    t.isIdentifier(callee) &&
    isHttpMethod(callee.name)
  ) {
    const routePath = getStringLiteral(node.arguments[0]);
    if (!routePath) return null;
    return {
      method: callee.name.toLowerCase(),
      receiver: "hono",
      routePath,
      routeArgs: node.arguments.filter(
        (arg): arg is t.Expression => t.isExpression(arg),
      ),
      middlewareStartIndex: 1,
    };
  }

  return null;
}

function extractRoutePrefixes(parsed: ReturnType<typeof parseSource>): Map<string, string> {
  const prefixes = new Map<string, string>();
  if (!parsed) return prefixes;

  traverseAst(parsed, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isCallExpression(path.node.init) || !t.isIdentifier(path.node.id)) return;
      const init = path.node.init;
      const callee = init.callee;

      const isExpressRouter =
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.property) &&
        callee.property.name === "Router";

      const isRouterIdentifier =
        t.isIdentifier(callee) && callee.name === "Router";

      if (isExpressRouter || isRouterIdentifier) {
        const prefix = getStringLiteral(init.arguments[0]);
        if (prefix) {
          prefixes.set(path.node.id.name, prefix);
        }
      }
    },
  });
  return prefixes;
}

function extractPrefixFromRegisterOptions(arg: t.Node | undefined): string {
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

function extractMountPrefixes(
  parsed: ReturnType<typeof parseSource>,
  receivers: Set<string>,
): Map<string, string> {
  const mounts = new Map<string, string>();
  if (!parsed) return mounts;

  traverseAst(parsed, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!t.isMemberExpression(path.node.callee)) return;
      const prop = path.node.callee.property;
      if (!t.isIdentifier(prop)) return;
      if (!t.isIdentifier(path.node.callee.object)) return;
      const receiver = path.node.callee.object.name;
      if (!receivers.has(receiver)) return;

      const arg0 = path.node.arguments[0];
      const arg1 = path.node.arguments[1];

      if (prop.name === "register") {
        if (!arg0 || !t.isExpression(arg0) || !t.isIdentifier(arg0)) return;
        const mountPath =
          arg1 && t.isExpression(arg1)
            ? extractPrefixFromRegisterOptions(arg1)
            : "";
        mounts.set(arg0.name, mountPath);
        return;
      }

      if (prop.name !== "use") return;

      if (arg1 && t.isExpression(arg1) && t.isIdentifier(arg1)) {
        const mountPath = getStringLiteral(arg0) ?? "";
        mounts.set(arg1.name, mountPath);
      } else if (
        arg0 &&
        t.isExpression(arg0) &&
        t.isIdentifier(arg0) &&
        !getStringLiteral(arg0)
      ) {
        mounts.set(arg0.name, "");
      }
    },
  });
  return mounts;
}

function deriveFolder(relativePath: string, routePath: string): string[] {
  const parts = relativePath.split("/").filter(Boolean);
  const folder: string[] = [];
  const skip = new Set(["src", "server", "api", "routes", "route", "index.ts", "index.js"]);
  for (const part of parts) {
    let clean = part.replace(/\.(ts|js|tsx|jsx|mjs)$/, "");
    clean = clean.replace(/\.(route|routes|controller)$/i, "");
    if (skip.has(clean) || clean === parts[parts.length - 1].replace(/\.(ts|js|tsx|jsx|mjs)$/, "")) continue;
    folder.push(clean.charAt(0).toUpperCase() + clean.slice(1));
  }
  if (folder.length === 0) {
    const segments = routePath.split("/").filter((s) => s && !s.startsWith(":"));
    if (segments[0]) folder.push(segments[0].charAt(0).toUpperCase() + segments[0].slice(1));
  }
  return folder;
}

function deriveEndpointName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "root";
  const clean = last.replace(/^:/, "").replace(/\[|\]/g, "");
  return clean
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function dedupeEndpoints(endpoints: ApiEndpoint[]): ApiEndpoint[] {
  const seen = new Set<string>();
  return endpoints.filter((ep) => {
    const key = `${ep.method}:${ep.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
