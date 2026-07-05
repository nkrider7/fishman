import type { FrameworkPlugin } from "../../../core/types";
import type { ApiEndpoint, HttpMethod } from "../../../models/endpoint";
import { getAllDependencies, discoverSourceFiles } from "../../../utils/file-discovery";
import { generateId } from "@/utils/id";

const METHOD_BY_FILENAME: Record<string, HttpMethod> = {
  route: "GET",
  "route.get": "GET",
  "route.post": "POST",
  "route.put": "PUT",
  "route.patch": "PATCH",
  "route.delete": "DELETE",
  "route.options": "OPTIONS",
  "route.head": "HEAD",
};

export const nextjsScanner: FrameworkPlugin = {
  id: "nextjs",
  name: "Next.js API Routes",
  languageId: "node",
  async detect(ctx) {
    if (!ctx.packageJson) return false;
    const deps = getAllDependencies(ctx.packageJson);
    return "next" in deps;
  },
  async scan(ctx) {
    const endpoints: ApiEndpoint[] = [];
    const files = await discoverSourceFiles(ctx.fs, ctx.projectPath, {
      maxFiles: ctx.options.maxFiles,
    });

    for (const file of files) {
      const rel = file.relativePath.replace(/\\/g, "/");
      if (!rel.includes("/api/") && !rel.includes("pages/api/") && !rel.includes("app/api/")) {
        continue;
      }

      const apiPath = filePathToApiRoute(rel);
      if (!apiPath) continue;

      const methods = detectExportedMethods(await ctx.fs.readFile(file.absolutePath).catch(() => ""));
      const folder = apiPath.split("/").filter(Boolean).slice(0, -1).map(capitalize);

      for (const method of methods) {
        endpoints.push({
          id: generateId(),
          name: `${method} ${apiPath}`,
          method,
          path: apiPath,
          description: `Next.js route ${rel}`,
          tags: ["nextjs", ...folder],
          folder,
          headers: [],
          queryParameters: [],
          pathParameters: extractNextParams(apiPath),
          responses: [{ statusCode: 200 }],
          middleware: [],
          sourceFile: rel,
          framework: "nextjs",
          warnings: [],
        });
      }
    }

    return endpoints;
  },
};

function filePathToApiRoute(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/");
  let match = normalized.match(/(?:app|pages)\/api\/(.+)\.(ts|js|tsx|jsx)$/);
  if (!match) return null;

  let route = match[1]
    .replace(/\/route\.(ts|js|tsx|jsx)$/, "")
    .replace(/\.(ts|js|tsx|jsx)$/, "")
    .replace(/\[([^\]]+)\]/g, ":$1")
    .replace(/\[\.\.\.([^\]]+)\]/g, ":$1*");

  if (METHOD_BY_FILENAME[route.split("/").pop() ?? ""]) {
    route = route.split("/").slice(0, -1).join("/");
  }

  return "/" + route.replace(/\/index$/, "");
}

function detectExportedMethods(code: string): HttpMethod[] {
  const methods: HttpMethod[] = [];
  const checks: [RegExp, HttpMethod][] = [
    [/export\s+(async\s+)?function\s+GET/m, "GET"],
    [/export\s+(async\s+)?function\s+POST/m, "POST"],
    [/export\s+(async\s+)?function\s+PUT/m, "PUT"],
    [/export\s+(async\s+)?function\s+PATCH/m, "PATCH"],
    [/export\s+(async\s+)?function\s+DELETE/m, "DELETE"],
    [/export\s+default\s+function/m, "GET"],
    [/req\.method|request\.method/m, "GET"],
  ];

  if (/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/m.test(code)) {
    for (const [regex, method] of checks.slice(0, 5)) {
      if (regex.test(code)) methods.push(method);
    }
    return methods.length ? methods : ["GET"];
  }

  if (code.includes("export default") || code.includes("handler")) {
    return ["GET", "POST", "PUT", "PATCH", "DELETE"];
  }

  return ["GET"];
}

function extractNextParams(path: string) {
  const regex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const params = [];
  let m;
  while ((m = regex.exec(path)) !== null) {
    params.push({ name: m[1], in: "path" as const, required: true });
  }
  return params;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
