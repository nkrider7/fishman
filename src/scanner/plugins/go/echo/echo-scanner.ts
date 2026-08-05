import type { FrameworkPlugin, FileSystemAdapter } from "../../../core/types";
import type { HttpMethod } from "../../../models/endpoint";
import type { RawRoute } from "../shared/types";
import { rawRoutesToEndpoints, dedupeRoutes } from "../shared/types";
import {
  detectGoProject,
  hasEchoDependency,
  sourceHasEchoImport,
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
  parseHttpMethod,
  lineNumberAtIndex,
  type BoundRouteCall,
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

export const echoScanner: FrameworkPlugin = {
  id: "echo",
  name: "Echo",
  languageId: "go",
  async detect(ctx) {
    const project =
      ctx.goProject != null
        ? { dependencies: ctx.goProject.dependencies }
        : await detectGoProject(ctx.fs, ctx.projectPath);

    if (hasEchoDependency(project.dependencies)) return true;

    const files = await discoverGoFiles(ctx.fs, ctx.projectPath, { maxFiles: 40 });
    for (const file of files.slice(0, 20)) {
      try {
        const source = await ctx.fs.readFile(file.absolutePath);
        if (sourceHasEchoImport(source)) return true;
      } catch {
        // ignore
      }
    }
    return false;
  },
  async scan(ctx) {
    const routes = await scanEcho(ctx.projectPath, ctx.fs);
    return rawRoutesToEndpoints(dedupeRoutes(routes), "echo");
  },
};

async function scanEcho(projectPath: string, fs: FileSystemAdapter): Promise<RawRoute[]> {
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
        ...extractEchoRoutesFromSource(
          file.source,
          file.absolutePath,
          file.relativePath,
          schemas,
          handlers,
        ),
      );
    } catch {
      // continue
    }
  }

  for (const file of files) {
    for (const match of file.source.matchAll(
      /([A-Za-z_][A-Za-z0-9_]*)\.(Register|Routes|Mount|Setup|Init|Configure)\s*\(/g,
    )) {
      const pkg = match[1];
      const fnName = match[2];
      const openParen = match.index! + match[0].length - 1;
      const prefix = resolveRegisterPrefix(file.source, openParen);

      for (const target of findPackageFiles(files, pkg, fnName)) {
        const body = extractFuncBody(target.source, fnName);
        if (!body) continue;
        try {
          allRoutes.push(
            ...extractEchoRoutesFromSource(
              body,
              target.absolutePath,
              target.relativePath,
              schemas,
              handlers,
              prefix,
            ),
          );
        } catch {
          // ignore
        }
      }
    }
  }

  return allRoutes;
}

function resolveRegisterPrefix(source: string, openParen: number): string {
  const closeParen = findMatchingParenEnd(source, openParen);
  if (closeParen < 0) return "";
  const inner = source.slice(openParen + 1, closeParen - 1).trim();

  const groupCall = inner.match(/\.Group\s*\(/);
  if (groupCall && groupCall.index != null) {
    const lit = extractGoStringLiteral(inner, groupCall.index + groupCall[0].length);
    if (lit != null) {
      const groupMap = buildGroupPrefixMap(source);
      const recv = inner.match(/^([A-Za-z_][A-Za-z0-9_]*)\.Group/);
      const parent = recv ? groupMap.get(recv[1]) ?? "" : "";
      return joinPaths(parent, lit);
    }
  }

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

export function extractEchoRoutesFromSource(
  source: string,
  sourceFile: string,
  relativePath: string,
  schemas = buildStructSchemaIndex([{ source, sourceFile: relativePath }]),
  handlers = buildHandlerIndex([{ source, sourceFile: relativePath }]),
  externalPrefix = "",
): RawRoute[] {
  const routes: RawRoute[] = [];
  const groupMap = buildGroupPrefixMap(source);
  const calls = [...parseGinEchoMethodCalls(source), ...parseEchoAddCalls(source)];

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

function parseEchoAddCalls(source: string): BoundRouteCall[] {
  const results: BoundRouteCall[] = [];
  const re = /\.Add\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const closeParen = findMatchingParenEnd(source, openParen);
    if (closeParen < 0) continue;
    const inner = source.slice(openParen + 1, closeParen - 1);

    let method: HttpMethod | null = null;
    const methodLit = extractGoStringLiteral(inner, 0);
    if (methodLit) method = parseHttpMethod(methodLit);
    if (!method) {
      const constMatch = inner.match(/http\.Method(\w+)/);
      if (constMatch) method = parseHttpMethod(constMatch[1]);
    }
    if (!method) continue;

    const comma = inner.indexOf(",");
    if (comma < 0) continue;
    const path = extractGoStringLiteral(inner.slice(comma + 1), 0);
    if (path == null) continue;

    const parts = inner.split(",");
    const last = parts[parts.length - 1]?.trim() ?? "";
    // Skip middleware-style trailing calls
    let handler: string | undefined;
    if (!/\(.*\)/.test(last)) {
      handler = last.match(
        /^((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)/,
      )?.[1];
    } else {
      for (let i = parts.length - 1; i >= 1; i--) {
        const p = parts[i].trim();
        if (/\(.*\)/.test(p)) continue;
        handler = p.match(
          /^((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)/,
        )?.[1];
        if (handler) break;
      }
    }

    results.push({
      method,
      path,
      handler,
      index: match.index,
      endIndex: closeParen,
    });
  }
  return results;
}
