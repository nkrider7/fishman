import type { FrameworkPlugin } from "../../../core/types";
import type { PythonScanContext, RawRoute } from "../shared/types";
import { hasPythonDependency } from "../shared/project-detector";
import { discoverPythonFiles } from "../../../utils/python-file-discovery";
import { parsePythonSource } from "../../../parsers/ast/python-parser";
import {
  extractRouterMounts,
  extractIncludeEdges,
  extractFlaskRouteDecorators,
  extractFlaskAddUrlRules,
} from "../shared/route-graph";
import { extractPathParamsFromPattern } from "../shared/schema-extractor";
import { detectEndpointAuth, extractModuleAuthPatterns } from "../shared/auth-detector";
import { flaskPathToOpenApi } from "../shared/ast-utils";
import { regexExtractFlaskRoutes } from "../shared/regex-fallback";

export const flaskScanner: FrameworkPlugin = {
  id: "flask",
  name: "Flask",
  languageId: "python",
  async detect(ctx) {
    const { detectPythonProject } = await import("../shared/project-detector");
    const project = await detectPythonProject(ctx.fs, ctx.projectPath);
    return hasPythonDependency(project.dependencies, "flask");
  },
  async scan(ctx) {
    const { detectPythonProject } = await import("../shared/project-detector");
    const project = await detectPythonProject(ctx.fs, ctx.projectPath);
    const scanCtx: PythonScanContext = {
      projectPath: ctx.projectPath,
      fs: ctx.fs,
      options: ctx.options,
      project,
      onProgress: ctx.onProgress,
    };
    const routes = await scanFlask(scanCtx);
    const { rawRoutesToEndpoints } = await import("../shared/types");
    return rawRoutesToEndpoints(routes, "flask");
  },
};

async function scanFlask(ctx: PythonScanContext): Promise<RawRoute[]> {
  const files = await discoverPythonFiles(ctx.fs, ctx.projectPath);
  const routes: RawRoute[] = [];

  for (const file of files) {
    let source: string;
    try {
      source = await ctx.fs.readFile(file.absolutePath);
    } catch {
      continue;
    }

    const mod = parsePythonSource(source, file.absolutePath);
    if (!mod) continue;

    const mounts = extractRouterMounts(mod, "flask");
    const includes = extractIncludeEdges(mod);
    const moduleAuth = extractModuleAuthPatterns([mod]);

    const astRoutes = [
      ...extractFlaskRouteDecorators(mod, mounts, includes),
      ...extractFlaskAddUrlRules(mod),
    ];

    for (const route of astRoutes) {
      route.path = flaskPathToOpenApi(route.path);
      route.pathParameters = extractPathParamsFromPattern(route.path);
      route.authentication = detectEndpointAuth(source, "", moduleAuth);
      routes.push(route);
    }

    if (astRoutes.length === 0) {
      routes.push(...regexExtractFlaskRoutes(source, file.absolutePath, moduleAuth));
    }
  }

  return dedupeRoutes(routes);
}

function dedupeRoutes(routes: RawRoute[]): RawRoute[] {
  const seen = new Map<string, RawRoute>();
  for (const r of routes) {
    const key = `${r.method}:${r.path}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}
