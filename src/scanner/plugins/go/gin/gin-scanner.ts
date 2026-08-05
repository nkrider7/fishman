import type { FrameworkPlugin, FileSystemAdapter } from "../../../core/types";
import type { RawRoute } from "../shared/types";
import { rawRoutesToEndpoints, dedupeRoutes } from "../shared/types";
import {
  detectGoProject,
  hasGinDependency,
  sourceHasGinImport,
} from "../shared/project-detector";
import { discoverGoFiles } from "../../../utils/go-file-discovery";
import {
  buildRawRoute,
  buildGroupPrefixMap,
  extractGoStringLiteral,
  findMatchingParenEnd,
  getReceiverPrefix,
  joinPaths,
  parseGinEchoMethodCalls,
  lineNumberAtIndex,
} from "../shared/route-extractor";
import { folderFromPathAndFile } from "../shared/path-utils";
import { buildStructSchemaIndex } from "../shared/schema-extractor";
import {
  buildHandlerIndex,
  enrichRouteFromHandler,
} from "../shared/handler-extractor";

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  source: string;
}

export const ginScanner: FrameworkPlugin = {
  id: "gin",
  name: "Gin",
  languageId: "go",
  async detect(ctx) {
    const project =
      ctx.goProject != null
        ? { dependencies: ctx.goProject.dependencies }
        : await detectGoProject(ctx.fs, ctx.projectPath);

    if (hasGinDependency(project.dependencies)) return true;

    const files = await discoverGoFiles(ctx.fs, ctx.projectPath, { maxFiles: 40 });
    for (const file of files.slice(0, 20)) {
      try {
        const source = await ctx.fs.readFile(file.absolutePath);
        if (sourceHasGinImport(source)) return true;
      } catch {
        // ignore
      }
    }
    return false;
  },
  async scan(ctx) {
    const routes = await scanGin(ctx.projectPath, ctx.fs);
    return rawRoutesToEndpoints(dedupeRoutes(routes), "gin");
  },
};

async function scanGin(projectPath: string, fs: FileSystemAdapter): Promise<RawRoute[]> {
  const discovered = await discoverGoFiles(fs, projectPath);
  const files: SourceFile[] = [];

  for (const file of discovered) {
    try {
      const source = await fs.readFile(file.absolutePath);
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
        ...extractGinRoutesFromSource(
          file.source,
          file.absolutePath,
          file.relativePath,
          schemas,
          handlers,
        ),
      );
    } catch {
      // malformed — continue
    }
  }

  for (const file of files) {
    try {
      allRoutes.push(...extractRegisterCalls(file, files, schemas, handlers));
    } catch {
      // ignore
    }
  }

  return allRoutes;
}

export function extractGinRoutesFromSource(
  source: string,
  sourceFile: string,
  relativePath: string,
  schemas = buildStructSchemaIndex([{ source, sourceFile: relativePath }]),
  handlers = buildHandlerIndex([{ source, sourceFile: relativePath }]),
  externalPrefix = "",
): RawRoute[] {
  const routes: RawRoute[] = [];
  const groupMap = buildGroupPrefixMap(source);
  const calls = parseGinEchoMethodCalls(source);

  for (const call of calls) {
    const receiverPrefix = getReceiverPrefix(source, call.index, groupMap);
    const prefix = joinPaths(externalPrefix, receiverPrefix);
    const lineNumber = lineNumberAtIndex(source, call.index);
    const fullPath = joinPaths(prefix, call.path || "/");

    const enrichment = enrichRouteFromHandler(
      call.method,
      fullPath,
      call.handler,
      handlers,
      schemas,
    );

    routes.push(
      buildRawRoute(
        call.method,
        call.path || "/",
        sourceFile,
        relativePath,
        source,
        lineNumber,
        call.handler,
        prefix,
        {
          ...enrichment,
          folder: folderFromPathAndFile(fullPath, relativePath, prefix || undefined),
        },
      ),
    );
  }

  return routes;
}

function extractRegisterCalls(
  file: SourceFile,
  allFiles: SourceFile[],
  schemas: ReturnType<typeof buildStructSchemaIndex>,
  handlers: ReturnType<typeof buildHandlerIndex>,
): RawRoute[] {
  const routes: RawRoute[] = [];

  // notes.Register(api)  /  handlers.Routes(v1)
  for (const match of file.source.matchAll(
    /([A-Za-z_][A-Za-z0-9_]*)\.(Register|Routes|Mount|Setup|Init|Configure)\s*\(/g,
  )) {
    const pkgOrRecv = match[1];
    const fnName = match[2];
    const openParen = match.index! + match[0].length - 1;
    const prefix = resolveRegisterPrefix(file.source, openParen);

    const targets = findPackageFiles(allFiles, pkgOrRecv, fnName);
    for (const target of targets) {
      const fnBody = extractFuncBody(target.source, fnName);
      if (!fnBody) continue;
      routes.push(
        ...extractGinRoutesFromSource(
          fnBody,
          target.absolutePath,
          target.relativePath,
          schemas,
          handlers,
          prefix,
        ),
      );
    }
  }

  return routes;
}

/** Resolve prefix from Register(api) or Register(r.Group("/api")). */
function resolveRegisterPrefix(source: string, openParen: number): string {
  const closeParen = findMatchingParenEnd(source, openParen);
  if (closeParen < 0) return "";
  const inner = source.slice(openParen + 1, closeParen - 1).trim();

  // r.Group("/api") or engine.Group("/api/v1")
  const groupCall = inner.match(/\.Group\s*\(/);
  if (groupCall && groupCall.index != null) {
    const lit = extractGoStringLiteral(inner, groupCall.index + groupCall[0].length);
    if (lit != null) {
      // Also compose if nested on a known group var — best-effort
      const groupMap = buildGroupPrefixMap(source);
      const recv = inner.match(/^([A-Za-z_][A-Za-z0-9_]*)\.Group/);
      const parent = recv ? groupMap.get(recv[1]) ?? "" : "";
      return joinPaths(parent, lit);
    }
  }

  // Bare variable: api
  const varName = inner.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|$)/)?.[1];
  if (varName) {
    const groupMap = buildGroupPrefixMap(source);
    return groupMap.get(varName) ?? "";
  }

  return "";
}

function findPackageFiles(
  files: SourceFile[],
  pkgName: string,
  fnName: string,
): SourceFile[] {
  const matched: SourceFile[] = [];
  for (const file of files) {
    const rel = file.relativePath.replace(/\\/g, "/");
    const pkg = file.source.match(/^package\s+(\w+)/m)?.[1];
    const pathHit =
      rel.endsWith(`/${pkgName}.go`) ||
      rel.includes(`/${pkgName}/`) ||
      pkg === pkgName;
    if (!pathHit) continue;
    if (extractFuncBody(file.source, fnName)) matched.push(file);
  }
  return matched;
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
