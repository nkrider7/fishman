import type { FrameworkPlugin, FileSystemAdapter } from "../../../core/types";
import type { RawRoute } from "../shared/types";
import { rawRoutesToEndpoints, dedupeRoutes } from "../shared/types";
import {
  detectRustProject,
  hasActixDependency,
} from "../shared/project-detector";
import { discoverRustFiles } from "../../../utils/rust-file-discovery";
import {
  actixMethodFromWebCall,
  buildRawRoute,
  combinedPrefix,
  extractRustStringLiteral,
  findStringAfterPattern,
  folderFromPathAndFile,
  parseActixRouteCall,
  parseHttpMethod,
  resolveChainPrefixes,
  resolveChainScopePrefixes,
} from "../shared/route-extractor";
import { lineNumberAtIndex } from "../shared/path-utils";
import { buildStructSchemaIndex } from "../shared/schema-extractor";
import {
  buildHandlerIndex,
  enrichRouteFromHandler,
} from "../shared/handler-extractor";

const ACTIX_ATTR_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "route",
];

const ACTIX_SOURCE_MARKERS = [
  "actix_web::",
  "web::scope",
  "web::resource",
  "web::get",
  "#[get(",
  "#[post(",
  "App::new",
];

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  source: string;
}

export const actixScanner: FrameworkPlugin = {
  id: "actix",
  name: "Actix Web",
  languageId: "rust",
  async detect(ctx) {
    const project =
      ctx.rustProject != null
        ? { dependencies: ctx.rustProject.dependencies }
        : await detectRustProject(ctx.fs, ctx.projectPath);

    if (hasActixDependency(project.dependencies)) return true;

    const files = await discoverRustFiles(ctx.fs, ctx.projectPath, { maxFiles: 40 });
    for (const file of files.slice(0, 20)) {
      try {
        const source = await ctx.fs.readFile(file.absolutePath);
        if (ACTIX_SOURCE_MARKERS.some((m) => source.includes(m))) return true;
      } catch {
        // ignore
      }
    }
    return false;
  },
  async scan(ctx) {
    const routes = await scanActix(ctx.projectPath, ctx.fs);
    return rawRoutesToEndpoints(dedupeRoutes(routes), "actix");
  },
};

async function scanActix(
  projectPath: string,
  fs: FileSystemAdapter,
): Promise<RawRoute[]> {
  const discovered = await discoverRustFiles(fs, projectPath);
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
        ...extractActixRoutesFromSource(
          file.source,
          file.absolutePath,
          file.relativePath,
          schemas,
          handlers,
        ),
      );
    } catch {
      // malformed source should not crash
    }
  }

  return allRoutes;
}

export function extractActixRoutesFromSource(
  source: string,
  sourceFile: string,
  relativePath: string,
  schemas = buildStructSchemaIndex([{ source, sourceFile: relativePath }]),
  handlers = buildHandlerIndex([{ source, sourceFile: relativePath }]),
): RawRoute[] {
  const routes: RawRoute[] = [];

  // Attribute macros: #[get("/path")], #[post("/path")]
  for (const method of ACTIX_ATTR_METHODS) {
    const attrPattern = new RegExp(`#\\[(?:actix_web::)?${method}\\s*\\(`, "g");
    for (const match of source.matchAll(attrPattern)) {
      const index = match.index!;
      const pathLiteral = extractRustStringLiteral(source, index + match[0].length);
      if (!pathLiteral) continue;

      const lineNumber = lineNumberAtIndex(source, index);
      const prefix = resolveChainPrefixes(source, index);

      let httpMethod = actixMethodFromWebCall(method) ?? "GET";
      if (method === "route") {
        const block = source.slice(index, index + 200);
        const methodMatch = block.match(/method\s*=\s*"([A-Z]+)"/i);
        if (methodMatch) {
          httpMethod = parseHttpMethod(methodMatch[1]) ?? httpMethod;
        }
      }

      const fnMatch = source
        .slice(index)
        .match(/\)\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
      const handler = fnMatch?.[1];
      const fullPathHint = [prefix, pathLiteral].filter(Boolean).join("/");
      const enrichment = enrichRouteFromHandler(
        httpMethod,
        fullPathHint || pathLiteral,
        handler,
        handlers,
        schemas,
      );

      routes.push(
        buildRawRoute(
          httpMethod,
          pathLiteral,
          sourceFile,
          relativePath,
          source,
          lineNumber,
          handler,
          prefix,
          {
            requestBody: enrichment.requestBody,
            queryParameters: enrichment.queryParameters,
            pathParameters: enrichment.pathParameters,
            headers: enrichment.headers,
            warnings: enrichment.warnings,
            folder: folderFromPathAndFile(
              fullPathHint || pathLiteral,
              relativePath,
              prefix || undefined,
            ),
          },
        ),
      );
    }
  }

  // Bounded `.route("/path", web::get().to(handler))`
  for (const match of source.matchAll(/\.route\s*\(/g)) {
    const index = match.index!;
    const parsed = parseActixRouteCall(source, index);
    if (!parsed || parsed.path === "/" && parsed.methods.length === 0) continue;
    // Skip resource-style `.route(web::get()...)` here — handled below
    if (parsed.path === "/" && !extractRustStringLiteral(source.slice(index + match[0].length), 0)) {
      // path "/" without a string literal means resource form — skip in this loop
      const after = source.slice(index + match[0].length).trimStart();
      if (!after.startsWith('"') && !after.startsWith("r#")) continue;
    }

    if (parsed.path === "/") continue;

    const lineNumber = lineNumberAtIndex(source, index);
    const prefix = resolveChainPrefixes(source, index);

    for (const { method, handler } of parsed.methods) {
      const fullPathHint = [prefix, parsed.path].filter(Boolean).join("/");
      const enrichment = enrichRouteFromHandler(
        method,
        fullPathHint || parsed.path,
        handler,
        handlers,
        schemas,
      );
      routes.push(
        buildRawRoute(
          method,
          parsed.path,
          sourceFile,
          relativePath,
          source,
          lineNumber,
          handler,
          prefix,
          {
            requestBody: enrichment.requestBody,
            queryParameters: enrichment.queryParameters,
            pathParameters: enrichment.pathParameters,
            headers: enrichment.headers,
            warnings: enrichment.warnings,
            folder: folderFromPathAndFile(
              fullPathHint || parsed.path,
              relativePath,
              prefix || undefined,
            ),
          },
        ),
      );
    }
  }

  // web::resource("/users").route(web::get().to(...))
  for (const resourceMatch of findStringAfterPattern(source, /(?:web::)?resource\s*\(/g)) {
    const resourceLine = lineNumberAtIndex(source, resourceMatch.index);
    const prefix = combinedPrefix(
      resolveChainScopePrefixes(source, resourceMatch.index),
      resourceMatch.value,
    );

    // Walk `.route(...)` calls that belong to this resource chain (bounded)
    let searchFrom = resourceMatch.index;
    const resourceEnd = Math.min(source.length, resourceMatch.index + 800);
    while (searchFrom < resourceEnd) {
      const rel = source.slice(searchFrom, resourceEnd);
      const routeIdx = rel.search(/\.route\s*\(/);
      if (routeIdx < 0) break;
      const absIdx = searchFrom + routeIdx;
      const parsed = parseActixRouteCall(source, absIdx);
      if (!parsed) {
        searchFrom = absIdx + 6;
        continue;
      }

      for (const { method, handler } of parsed.methods) {
        const enrichment = enrichRouteFromHandler(
          method,
          prefix || "/",
          handler,
          handlers,
          schemas,
        );
        routes.push(
          buildRawRoute(
            method,
            "/",
            sourceFile,
            relativePath,
            source,
            resourceLine,
            handler,
            prefix,
            {
              requestBody: enrichment.requestBody,
              queryParameters: enrichment.queryParameters,
              pathParameters: enrichment.pathParameters,
              headers: enrichment.headers,
              warnings: enrichment.warnings,
              folder: folderFromPathAndFile(prefix || "/", relativePath, prefix || undefined),
            },
          ),
        );
      }
      searchFrom = parsed.endIndex;
    }
  }

  return routes;
}
