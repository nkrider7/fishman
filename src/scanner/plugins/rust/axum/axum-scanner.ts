import type { FrameworkPlugin, FileSystemAdapter } from "../../../core/types";
import type { RawRoute } from "../shared/types";
import { rawRoutesToEndpoints, dedupeRoutes } from "../shared/types";
import {
  detectRustProject,
  hasAxumDependency,
} from "../shared/project-detector";
import { discoverRustFiles } from "../../../utils/rust-file-discovery";
import {
  buildRawRoute,
  extractFunctionBody,
  extractMergeFunctionMappings,
  extractNestFunctionMappings,
  folderFromPathAndFile,
  parseAxumRouteCall,
  type NestFunctionMapping,
} from "../shared/route-extractor";
import { lineNumberAtIndex } from "../shared/path-utils";
import { buildStructSchemaIndex } from "../shared/schema-extractor";
import {
  buildHandlerIndex,
  enrichRouteFromHandler,
} from "../shared/handler-extractor";

const AXUM_SOURCE_MARKERS = [
  "axum::",
  "Router::new",
  ".nest(",
  ".merge(",
  "routing::get",
];

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  source: string;
}

export const axumScanner: FrameworkPlugin = {
  id: "axum",
  name: "Axum",
  languageId: "rust",
  async detect(ctx) {
    const project =
      ctx.rustProject != null
        ? { dependencies: ctx.rustProject.dependencies }
        : await detectRustProject(ctx.fs, ctx.projectPath);

    if (hasAxumDependency(project.dependencies)) return true;

    const files = await discoverRustFiles(ctx.fs, ctx.projectPath, { maxFiles: 40 });
    for (const file of files.slice(0, 20)) {
      try {
        const source = await ctx.fs.readFile(file.absolutePath);
        if (AXUM_SOURCE_MARKERS.some((m) => source.includes(m))) return true;
      } catch {
        // ignore
      }
    }
    return false;
  },
  async scan(ctx) {
    const routes = await scanAxum(ctx.projectPath, ctx.fs);
    return rawRoutesToEndpoints(dedupeRoutes(routes), "axum");
  },
};

async function scanAxum(
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
      // skip unreadable
    }
  }

  const schemas = buildStructSchemaIndex(
    files.map((f) => ({ source: f.source, sourceFile: f.relativePath })),
  );
  const handlers = buildHandlerIndex(
    files.map((f) => ({ source: f.source, sourceFile: f.relativePath })),
  );

  const allRoutes: RawRoute[] = [];
  const visitedRouterFns = new Set<string>();

  const nestMappings: NestFunctionMapping[] = [];
  for (const file of files) {
    nestMappings.push(
      ...extractNestFunctionMappings(file.source),
      ...extractMergeFunctionMappings(file.source),
    );
  }

  for (const file of files) {
    try {
      const skipRanges = collectNestedFnRanges(file.source, nestMappings);
      allRoutes.push(
        ...extractAxumRoutesFromSlice({
          slice: file.source,
          sliceOffset: 0,
          file,
          externalPrefix: "",
          skipRanges,
          schemas,
          handlers,
        }),
      );
    } catch {
      // continue
    }
  }

  for (const mapping of nestMappings) {
    const key = `${mapping.modulePath ?? ""}::${mapping.functionName}@${mapping.prefix}`;
    if (visitedRouterFns.has(key)) continue;
    visitedRouterFns.add(key);

    const target = resolveRouterFunction(files, mapping);
    if (!target) continue;

    try {
      const fnBody = extractFunctionBody(target.source, mapping.functionName);
      if (!fnBody) continue;

      allRoutes.push(
        ...extractAxumRoutesFromSlice({
          slice: fnBody.body,
          sliceOffset: fnBody.bodyStart,
          file: target,
          externalPrefix: mapping.prefix,
          skipRanges: [],
          schemas,
          handlers,
        }),
      );

      const innerNests = [
        ...extractNestFunctionMappings(fnBody.body),
        ...extractMergeFunctionMappings(fnBody.body),
      ];
      for (const inner of innerNests) {
        const innerKey = `${inner.modulePath ?? ""}::${inner.functionName}@${mapping.prefix}${inner.prefix}`;
        if (visitedRouterFns.has(innerKey)) continue;
        visitedRouterFns.add(innerKey);
        const innerTarget = resolveRouterFunction(files, inner);
        if (!innerTarget) continue;
        const innerBody = extractFunctionBody(innerTarget.source, inner.functionName);
        if (!innerBody) continue;
        const composedPrefix = [mapping.prefix, inner.prefix]
          .filter(Boolean)
          .join("/")
          .replace(/\/{2,}/g, "/");
        allRoutes.push(
          ...extractAxumRoutesFromSlice({
            slice: innerBody.body,
            sliceOffset: innerBody.bodyStart,
            file: innerTarget,
            externalPrefix: composedPrefix,
            skipRanges: [],
            schemas,
            handlers,
          }),
        );
      }
    } catch {
      // ignore malformed nested routers
    }
  }

  return allRoutes;
}

function collectNestedFnRanges(
  source: string,
  nestMappings: NestFunctionMapping[],
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const seen = new Set<string>();
  for (const m of nestMappings) {
    if (m.modulePath) continue;
    if (seen.has(m.functionName)) continue;
    seen.add(m.functionName);
    const body = extractFunctionBody(source, m.functionName);
    if (body) {
      ranges.push({ start: body.bodyStart, end: body.bodyStart + body.body.length });
    }
  }
  return ranges;
}

function resolveRouterFunction(
  files: SourceFile[],
  mapping: NestFunctionMapping,
): SourceFile | null {
  if (!mapping.modulePath) {
    for (const file of files) {
      if (extractFunctionBody(file.source, mapping.functionName)) return file;
    }
    return null;
  }

  const modParts = mapping.modulePath.replace(/^crate::/, "").split("::").filter(Boolean);
  const last = modParts[modParts.length - 1];

  for (const file of files) {
    const rel = file.relativePath.replace(/\\/g, "/");
    const base = rel.split("/").pop() ?? "";
    const matchesModule =
      base === `${last}.rs` ||
      rel.endsWith(`/${last}/mod.rs`) ||
      rel.endsWith(`/${modParts.join("/")}.rs`) ||
      rel.endsWith(`/${modParts.join("/")}/mod.rs`);
    if (matchesModule && extractFunctionBody(file.source, mapping.functionName)) {
      return file;
    }
  }

  // Last resort: any file containing the function
  for (const file of files) {
    if (extractFunctionBody(file.source, mapping.functionName)) return file;
  }
  return null;
}

function extractAxumRoutesFromSlice(opts: {
  slice: string;
  sliceOffset: number;
  file: SourceFile;
  externalPrefix: string;
  skipRanges: Array<{ start: number; end: number }>;
  schemas: ReturnType<typeof buildStructSchemaIndex>;
  handlers: ReturnType<typeof buildHandlerIndex>;
}): RawRoute[] {
  const { slice, sliceOffset, file, externalPrefix, skipRanges, schemas, handlers } =
    opts;
  const routes: RawRoute[] = [];

  for (const match of slice.matchAll(/\.route\s*\(/g)) {
    const index = match.index!;
    const absIndex = sliceOffset + index;

    if (skipRanges.some((r) => absIndex >= r.start && absIndex <= r.end)) {
      continue;
    }

    const parsed = parseAxumRouteCall(slice, index);
    if (!parsed || parsed.methods.length === 0) continue;

    const lineNumber = lineNumberAtIndex(file.source, absIndex);
    const composedForParams = [externalPrefix, parsed.path]
      .filter(Boolean)
      .join("/")
      .replace(/\/{2,}/g, "/");

    for (const { method, handler } of parsed.methods) {
      const enrichment = enrichRouteFromHandler(
        method,
        composedForParams || parsed.path,
        handler,
        handlers,
        schemas,
      );

      const route = buildRawRoute(
        method,
        parsed.path,
        file.absolutePath,
        file.relativePath,
        file.source,
        lineNumber,
        handler,
        externalPrefix,
        {
          requestBody: enrichment.requestBody,
          queryParameters: enrichment.queryParameters,
          pathParameters: enrichment.pathParameters,
          headers: enrichment.headers,
          warnings: enrichment.warnings,
          folder: folderFromPathAndFile(
            [externalPrefix, parsed.path].filter(Boolean).join("/") || parsed.path,
            file.relativePath,
            externalPrefix || undefined,
          ),
        },
      );
      routes.push(route);
    }
  }

  return routes;
}

/** Exported for unit tests */
export function extractAxumRoutesFromSource(
  source: string,
  sourceFile: string,
  relativePath: string,
): RawRoute[] {
  const file: SourceFile = { absolutePath: sourceFile, relativePath, source };
  const schemas = buildStructSchemaIndex([{ source, sourceFile: relativePath }]);
  const handlers = buildHandlerIndex([{ source, sourceFile: relativePath }]);
  const nestMappings = extractNestFunctionMappings(source);
  const skipRanges = collectNestedFnRanges(source, nestMappings);

  const routes = extractAxumRoutesFromSlice({
    slice: source,
    sliceOffset: 0,
    file,
    externalPrefix: "",
    skipRanges,
    schemas,
    handlers,
  });

  for (const mapping of nestMappings) {
    const fnBody = extractFunctionBody(source, mapping.functionName);
    if (!fnBody) continue;
    routes.push(
      ...extractAxumRoutesFromSlice({
        slice: fnBody.body,
        sliceOffset: fnBody.bodyStart,
        file,
        externalPrefix: mapping.prefix,
        skipRanges: [],
        schemas,
        handlers,
      }),
    );
  }

  return dedupeRoutes(routes);
}
