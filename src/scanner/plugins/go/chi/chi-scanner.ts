import type { FrameworkPlugin, FileSystemAdapter } from "../../../core/types";
import type { RawRoute } from "../shared/types";
import { rawRoutesToEndpoints, dedupeRoutes } from "../shared/types";
import {
  detectGoProject,
  hasChiDependency,
  sourceHasChiImport,
} from "../shared/project-detector";
import { discoverGoFiles } from "../../../utils/go-file-discovery";
import {
  buildRawRoute,
  extractChiRouteBlocks,
  extractGoStringLiteral,
  findMatchingParenEnd,
  joinPaths,
  parseChiMethodCalls,
  lineNumberAtIndex,
} from "../shared/route-extractor";
import { folderFromPathAndFile, normalizePath } from "../shared/path-utils";
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

export const chiScanner: FrameworkPlugin = {
  id: "chi",
  name: "Chi",
  languageId: "go",
  async detect(ctx) {
    const project =
      ctx.goProject != null
        ? { dependencies: ctx.goProject.dependencies }
        : await detectGoProject(ctx.fs, ctx.projectPath);

    if (hasChiDependency(project.dependencies)) return true;

    const files = await discoverGoFiles(ctx.fs, ctx.projectPath, { maxFiles: 40 });
    for (const file of files.slice(0, 20)) {
      try {
        const source = await ctx.fs.readFile(file.absolutePath);
        if (sourceHasChiImport(source)) return true;
      } catch {
        // ignore
      }
    }
    return false;
  },
  async scan(ctx) {
    const routes = await scanChi(ctx.projectPath, ctx.fs);
    return rawRoutesToEndpoints(dedupeRoutes(routes), "chi");
  },
};

async function scanChi(projectPath: string, fs: FileSystemAdapter): Promise<RawRoute[]> {
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
        ...extractChiRoutesFromSource(
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

  // Cross-file: r.Route("/api", notes.Routes) or r.Mount("/api", notes.Router())
  for (const file of files) {
    for (const match of file.source.matchAll(
      /\.Route\s*\(\s*(["`][^"`]*["`])\s*,\s*((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)/g,
    )) {
      const prefix = extractGoStringLiteral(match[1], 0) ?? match[1].slice(1, -1);
      const ref = match[2];
      if (ref.startsWith("func")) continue;

      const { pkg, fnName } = splitRef(ref);
      const target = findHandlerFile(files, pkg, fnName);
      if (!target) continue;
      const body = extractFuncBody(target.source, fnName);
      if (!body) continue;

      try {
        allRoutes.push(
          ...extractChiRoutesFromSource(
            body,
            target.absolutePath,
            target.relativePath,
            schemas,
            handlers,
            normalizePath(prefix),
          ),
        );
      } catch {
        // ignore
      }
    }

    for (const match of file.source.matchAll(
      /\.Mount\s*\(\s*(["`][^"`]*["`])\s*,\s*((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)/g,
    )) {
      const prefix = extractGoStringLiteral(match[1], 0) ?? match[1].slice(1, -1);
      const ref = match[2];
      const { pkg, fnName } = splitRef(ref);
      const target = findHandlerFile(files, pkg, fnName === ref ? "Router" : fnName);
      // Also try Routes / NewRouter
      const candidates = [fnName, "Routes", "Router", "Handler", "NewRouter"];
      let body: string | null = null;
      let targetFile: SourceFile | null = target;
      for (const name of candidates) {
        const f = findHandlerFile(files, pkg, name) ?? target;
        if (!f) continue;
        body = extractFuncBody(f.source, name);
        if (body) {
          targetFile = f;
          break;
        }
      }
      // Mount often passes http.Handler from a function call notes.Router()
      if (!body && ref.includes(".")) {
        const f = findHandlerFile(files, pkg, "Routes") ?? findHandlerFile(files, pkg, "Router");
        if (f) {
          body = extractFuncBody(f.source, "Routes") ?? extractFuncBody(f.source, "Router");
          targetFile = f;
        }
      }
      if (!body || !targetFile) continue;

      try {
        allRoutes.push(
          ...extractChiRoutesFromSource(
            body,
            targetFile.absolutePath,
            targetFile.relativePath,
            schemas,
            handlers,
            normalizePath(prefix),
          ),
        );
      } catch {
        // ignore
      }
    }
  }

  return allRoutes;
}

function splitRef(ref: string): { pkg?: string; fnName: string } {
  if (ref.includes(".")) {
    const [pkg, fnName] = ref.split(".");
    return { pkg, fnName };
  }
  return { fnName: ref };
}

function findHandlerFile(
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

export function extractChiRoutesFromSource(
  source: string,
  sourceFile: string,
  relativePath: string,
  schemas = buildStructSchemaIndex([{ source, sourceFile: relativePath }]),
  handlers = buildHandlerIndex([{ source, sourceFile: relativePath }]),
  externalPrefix = "",
): RawRoute[] {
  const routes: RawRoute[] = [];

  // Top-level method calls (outside Route blocks — we'll also walk blocks)
  const topCalls = parseChiMethodCalls(source);
  const routeBlocks = extractChiRouteBlocks(source);

  // Collect ranges of Route callback bodies to skip from top-level (avoid double count without prefix)
  const nestedRanges = routeBlocks.map((b) => ({
    start: b.bodyStart,
    end: b.bodyStart + b.body.length,
  }));

  for (const call of topCalls) {
    if (nestedRanges.some((r) => call.index >= r.start && call.index <= r.end)) {
      continue;
    }
    routes.push(
      ...routeFromCall(call, source, sourceFile, relativePath, externalPrefix, schemas, handlers),
    );
  }

  // Nested Route blocks (support one level of nesting inside each block recursively)
  for (const block of routeBlocks) {
    const prefix = joinPaths(externalPrefix, block.prefix);
    const innerCalls = parseChiMethodCalls(block.body);
    const innerBlocks = extractChiRouteBlocks(block.body);
    const innerNested = innerBlocks.map((b) => ({
      start: b.bodyStart,
      end: b.bodyStart + b.body.length,
    }));

    for (const call of innerCalls) {
      // Adjust index is relative to block.body — fine for line numbers use bodyStart offset
      if (innerNested.some((r) => call.index >= r.start && call.index <= r.end)) {
        continue;
      }
      const absIndex = block.bodyStart + call.index;
      routes.push(
        ...routeFromCall(
          { ...call, index: absIndex },
          source,
          sourceFile,
          relativePath,
          prefix,
          schemas,
          handlers,
        ),
      );
    }

    for (const inner of innerBlocks) {
      const innerPrefix = joinPaths(prefix, inner.prefix);
      const deepCalls = parseChiMethodCalls(inner.body);
      for (const call of deepCalls) {
        const absIndex = inner.bodyStart + call.index;
        routes.push(
          ...routeFromCall(
            { ...call, index: absIndex },
            source,
            sourceFile,
            relativePath,
            innerPrefix,
            schemas,
            handlers,
          ),
        );
      }
    }
  }

  // Mount with inline router is rare; Mount to function handled in scanChi

  void findMatchingParenEnd;
  return routes;
}

function routeFromCall(
  call: import("../shared/route-extractor").BoundRouteCall,
  source: string,
  sourceFile: string,
  relativePath: string,
  prefix: string,
  schemas: ReturnType<typeof buildStructSchemaIndex>,
  handlers: ReturnType<typeof buildHandlerIndex>,
): RawRoute[] {
  const lineNumber = lineNumberAtIndex(source, call.index);
  const composed = [prefix, call.path].filter(Boolean).join("/");
  const enrichment = enrichRouteFromHandler(
    call.method,
    composed || call.path,
    call.handler,
    handlers,
    schemas,
  );

  return [
    buildRawRoute(
      call.method,
      call.path,
      sourceFile,
      relativePath,
      source,
      lineNumber,
      call.handler,
      prefix,
      {
        ...enrichment,
        folder: folderFromPathAndFile(
          composed || call.path,
          relativePath,
          prefix || undefined,
        ),
      },
    ),
  ];
}
