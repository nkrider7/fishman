import type { FrameworkPlugin, FileSystemAdapter } from "../../../core/types";
import type { HttpMethod } from "../../../models/endpoint";
import type { RawRoute } from "../shared/types";
import { rawRoutesToEndpoints, dedupeRoutes } from "../shared/types";
import {
  detectGoProject,
  sourceHasNetHttpImport,
  sourceHasNetHttpServerRoutes,
  sourceIsGoFrameworkRouter,
} from "../shared/project-detector";
import { discoverGoFiles } from "../../../utils/go-file-discovery";
import {
  buildRawRoute,
  findHandlerFactoryBodyRanges,
  findServeMuxVariables,
  inferHttpMethodsFromHandlerBody,
  joinPaths,
  lineNumberAtIndex,
  parseNetHttpHandleCalls,
  type NetHttpHandleCall,
} from "../shared/route-extractor";
import { folderFromPathAndFile, normalizePath } from "../shared/path-utils";
import { buildStructSchemaIndex } from "../shared/schema-extractor";
import {
  buildHandlerIndex,
  enrichRouteFromHandler,
  type GoHandlerInfo,
} from "../shared/handler-extractor";
import type { GoStructSchema } from "../shared/schema-extractor";

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  source: string;
}

export const netHttpScanner: FrameworkPlugin = {
  id: "nethttp",
  name: "net/http",
  languageId: "go",
  async detect(ctx) {
    // go.mod presence is soft — language plugin already gated on Go
    void detectGoProject;

    const files = await discoverGoFiles(ctx.fs, ctx.projectPath, { maxFiles: 50 });
    for (const file of files.slice(0, 30)) {
      try {
        const source = await ctx.fs.readFile(file.absolutePath);
        if (sourceIsGoFrameworkRouter(source)) continue;
        if (
          sourceHasNetHttpImport(source) &&
          sourceHasNetHttpServerRoutes(source)
        ) {
          return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  },
  async scan(ctx) {
    const routes = await scanNetHttp(ctx.projectPath, ctx.fs);
    return rawRoutesToEndpoints(dedupeRoutes(routes), "nethttp");
  },
};

async function scanNetHttp(
  projectPath: string,
  fs: FileSystemAdapter,
): Promise<RawRoute[]> {
  const discovered = await discoverGoFiles(fs, projectPath);
  const files: SourceFile[] = [];

  for (const file of discovered) {
    try {
      const source = await fs.readFile(file.absolutePath);
      if (sourceIsGoFrameworkRouter(source)) continue;
      files.push({
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        source,
      });
    } catch {
      // skip
    }
  }

  const schemas = buildStructSchemaIndex(
    files.map((f) => ({ source: f.source, sourceFile: f.relativePath })),
  );
  const handlers = buildHandlerIndex(
    files.map((f) => ({ source: f.source, sourceFile: f.relativePath })),
  );

  const allRoutes: RawRoute[] = [];

  for (const file of files) {
    try {
      allRoutes.push(
        ...extractNetHttpRoutesFromSource(
          file.source,
          file.absolutePath,
          file.relativePath,
          schemas,
          handlers,
          files,
        ),
      );
    } catch {
      // continue
    }
  }

  return allRoutes;
}

export function extractNetHttpRoutesFromSource(
  source: string,
  sourceFile: string,
  relativePath: string,
  schemas = buildStructSchemaIndex([{ source, sourceFile: relativePath }]),
  handlers = buildHandlerIndex([{ source, sourceFile: relativePath }]),
  allFiles: SourceFile[] = [],
  externalPrefix = "",
): RawRoute[] {
  const routes: RawRoute[] = [];
  const muxVars = findServeMuxVariables(source);
  const factoryRanges = findHandlerFactoryBodyRanges(source);
  const calls = parseNetHttpHandleCalls(source);

  const routesByReceiver = new Map<string, NetHttpHandleCall[]>();
  const mounts: Array<{
    call: NetHttpHandleCall;
    prefix: string;
  }> = [];
  const mountedChildVars = new Set<string>();

  for (const call of calls) {
    if (call.isFileServer || call.isSkippedHandler) continue;

    const inFactory = factoryRanges.some(
      (r) => call.index >= r.start && call.index <= r.end,
    );
    if (inFactory) continue;

    // StripPrefix / Routes() → mount
    if (call.mount?.stripPrefix || call.mount?.childRef) {
      mounts.push({ call, prefix: mountPrefixFromCall(call) });
      if (call.mount.childVar) mountedChildVars.add(call.mount.childVar);
      continue;
    }

    // Sub-mux variable mount: mux.Handle("/api/", api)
    if (call.mount?.childVar && muxVars.has(call.mount.childVar)) {
      mounts.push({ call, prefix: mountPrefixFromCall(call) });
      mountedChildVars.add(call.mount.childVar);
      continue;
    }

    const list = routesByReceiver.get(call.receiver) ?? [];
    list.push(call);
    routesByReceiver.set(call.receiver, list);
  }

  // Emit direct routes (default mux + root muxes); skip muxes that are only mounted children
  for (const [recv, recvCalls] of routesByReceiver) {
    if (mountedChildVars.has(recv)) continue;
    for (const call of recvCalls) {
      routes.push(
        ...emitRouteCalls(
          call,
          source,
          sourceFile,
          relativePath,
          externalPrefix,
          schemas,
          handlers,
        ),
      );
    }
  }

  // Resolve mounts (StripPrefix / sub-mux / cross-file Routes())
  for (const { call, prefix } of mounts) {
    const fullPrefix = joinPaths(externalPrefix, prefix);
    const childRoutes = resolveMountedChildRoutes(
      call,
      source,
      sourceFile,
      relativePath,
      allFiles,
      muxVars,
    );
    for (const child of childRoutes) {
      routes.push(
        ...emitRouteCalls(
          child.call,
          child.source,
          child.sourceFile,
          child.relativePath,
          fullPrefix,
          schemas,
          handlers,
        ),
      );
    }
  }

  return routes;
}

function mountPrefixFromCall(call: NetHttpHandleCall): string {
  if (call.mount?.stripPrefix) {
    return normalizePath(call.mount.stripPrefix);
  }
  return call.path;
}

function resolveMountedChildRoutes(
  call: NetHttpHandleCall,
  source: string,
  sourceFile: string,
  relativePath: string,
  allFiles: SourceFile[],
  muxVars: Set<string>,
): Array<{
  call: NetHttpHandleCall;
  source: string;
  sourceFile: string;
  relativePath: string;
}> {
  const results: Array<{
    call: NetHttpHandleCall;
    source: string;
    sourceFile: string;
    relativePath: string;
  }> = [];

  // Same-file mux variable
  if (call.mount?.childVar && muxVars.has(call.mount.childVar)) {
    const childCalls = parseNetHttpHandleCalls(source).filter(
      (c) =>
        c.receiver === call.mount!.childVar &&
        !c.isFileServer &&
        !c.isSkippedHandler &&
        !c.mount?.stripPrefix &&
        !(c.mount?.childVar && muxVars.has(c.mount.childVar)),
    );
    for (const c of childCalls) {
      // Skip nested mounts here; only leaf routes
      if (c.mount?.childRef) continue;
      if (c.mount?.childVar && muxVars.has(c.mount.childVar)) continue;
      results.push({ call: c, source, sourceFile, relativePath });
    }
    return results;
  }

  // Cross-file / factory: notes.Routes()
  const ref = call.mount?.childRef;
  if (ref) {
    const { pkg, fnName } = splitRef(ref.replace(/\(\s*\)$/, ""));
    const candidates = [fnName, "Routes", "Router", "Handler", "NewMux", "Mux"];
    for (const name of candidates) {
      const target =
        findFuncFile(allFiles.length ? allFiles : [{ absolutePath: sourceFile, relativePath, source }], pkg, name) ??
        (extractFuncBody(source, name)
          ? { absolutePath: sourceFile, relativePath, source }
          : null);
      if (!target) continue;
      const body = extractFuncBody(target.source, name);
      if (!body) continue;

      const childMuxVars = findServeMuxVariables(body);
      const childCalls = parseNetHttpHandleCalls(body).filter(
        (c) =>
          !c.isFileServer &&
          !c.isSkippedHandler &&
          !c.mount?.stripPrefix &&
          !c.mount?.childRef &&
          !(c.mount?.childVar && childMuxVars.has(c.mount.childVar)),
      );
      for (const c of childCalls) {
        results.push({
          call: c,
          source: target.source,
          sourceFile: target.absolutePath,
          relativePath: target.relativePath,
        });
      }
      if (results.length > 0) break;
    }
  }

  return results;
}

function emitRouteCalls(
  call: NetHttpHandleCall,
  source: string,
  sourceFile: string,
  relativePath: string,
  prefix: string,
  schemas: Map<string, GoStructSchema>,
  handlers: Map<string, GoHandlerInfo>,
): RawRoute[] {
  // If mount-only placeholder slipped through without being a real handler
  if (
    call.mount?.childVar &&
    !call.handler &&
    findServeMuxVariables(source).has(call.mount.childVar)
  ) {
    return [];
  }

  const lineNumber = lineNumberAtIndex(source, call.index);
  const handlerName = call.handler;
  const methods = resolveMethods(call, handlerName, handlers);
  const out: RawRoute[] = [];

  for (const method of methods) {
    const composed = joinPaths(prefix, call.path);
    const enrichment = enrichRouteFromHandler(
      method,
      composed,
      handlerName,
      handlers,
      schemas,
    );

    // Inline handler body enrichment (best-effort)
    if (!handlerName && call.handlerExpr.startsWith("func")) {
      const inlineBody = extractInlineFuncBody(call.handlerExpr);
      if (inlineBody) {
        const inlineEnrichment = enrichFromInlineBody(
          method,
          composed,
          inlineBody,
          schemas,
        );
        Object.assign(enrichment, {
          requestBody: enrichment.requestBody ?? inlineEnrichment.requestBody,
          queryParameters:
            enrichment.queryParameters.length > 0
              ? enrichment.queryParameters
              : inlineEnrichment.queryParameters,
          pathParameters:
            enrichment.pathParameters.length > 0
              ? enrichment.pathParameters
              : inlineEnrichment.pathParameters,
        });
      }
    }

    out.push(
      buildRawRoute(
        method,
        call.path,
        sourceFile,
        relativePath,
        source,
        lineNumber,
        handlerName,
        prefix,
        {
          ...enrichment,
          folder: folderFromPathAndFile(
            composed,
            relativePath,
            prefix || undefined,
          ),
        },
      ),
    );
  }

  return out;
}

function resolveMethods(
  call: NetHttpHandleCall,
  handlerName: string | undefined,
  handlers: Map<string, GoHandlerInfo>,
): HttpMethod[] {
  if (call.method) return [call.method];

  if (!handlerName) {
    if (call.handlerExpr.startsWith("func")) {
      const body = extractInlineFuncBody(call.handlerExpr);
      if (body) return inferHttpMethodsFromHandlerBody(body);
    }
    return ["GET"];
  }

  const simpleName = handlerName.includes(".")
    ? handlerName.slice(handlerName.lastIndexOf(".") + 1)
    : handlerName;
  const handler = handlers.get(simpleName) ?? handlers.get(handlerName);
  if (!handler) return ["GET"];

  const body = handler.source.slice(handler.bodyStart, handler.bodyEnd);
  return inferHttpMethodsFromHandlerBody(body);
}

function enrichFromInlineBody(
  method: HttpMethod,
  path: string,
  body: string,
  schemas: Map<string, GoStructSchema>,
) {
  // Reuse enrichRouteFromHandler by synthesizing a temporary handler map
  const handlers = new Map<string, GoHandlerInfo>();
  handlers.set("__inline", {
    name: "__inline",
    sourceFile: "",
    source: `{${body}}`,
    bodyStart: 1,
    bodyEnd: 1 + body.length,
  });
  return enrichRouteFromHandler(method, path, "__inline", handlers, schemas);
}

function extractInlineFuncBody(expr: string): string | null {
  const brace = expr.indexOf("{");
  if (brace < 0) return null;
  let depth = 0;
  for (let i = brace; i < expr.length; i++) {
    if (expr[i] === "{") depth++;
    else if (expr[i] === "}") {
      depth--;
      if (depth === 0) return expr.slice(brace + 1, i);
    }
  }
  return null;
}

function splitRef(ref: string): { pkg?: string; fnName: string } {
  if (ref.includes(".")) {
    const [pkg, fnName] = ref.split(".");
    return { pkg, fnName };
  }
  return { fnName: ref };
}

function findFuncFile(
  files: SourceFile[],
  pkg: string | undefined,
  fnName: string,
): SourceFile | null {
  for (const file of files) {
    if (pkg) {
      const pkgMatch = file.source.match(/^package\s+(\w+)/m)?.[1];
      const rel = file.relativePath.replace(/\\/g, "/");
      if (pkgMatch !== pkg && !rel.includes(`/${pkg}/`)) continue;
    }
    if (extractFuncBody(file.source, fnName)) return file;
  }
  return null;
}

function extractFuncBody(source: string, fnName: string): string | null {
  const re = new RegExp(
    `func\\s+(?:\\([^)]*\\)\\s+)?${fnName}\\s*\\([^)]*\\)[^{]*\\{`,
  );
  const match = re.exec(source);
  if (!match) return null;
  const braceStart = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(braceStart + 1, i);
    }
  }
  return null;
}
