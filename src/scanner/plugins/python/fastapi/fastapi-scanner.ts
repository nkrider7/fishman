import type { FrameworkPlugin } from "../../../core/types";
import type { RawRoute, PythonScanContext } from "../shared/types";
import { hasPythonDependency } from "../shared/project-detector";
import { discoverPythonFiles } from "../../../utils/python-file-discovery";
import { parsePythonSource } from "../../../parsers/ast/python-parser";
import {
  extractRouterMounts,
  extractIncludeEdges,
  extractFastAPIRoutesFromModule,
} from "../shared/route-graph";
import {
  extractSchemasFromModules,
  extractPathParamsFromPattern,
  findSchemaByName,
  schemaToRequestBody,
} from "../shared/schema-extractor";
import { detectEndpointAuth, extractModuleAuthPatterns } from "../shared/auth-detector";
import { parseDocstring, exampleForType } from "../shared/example-values";
import {
  getAttributeChain,
  isNodeType,
} from "../shared/ast-utils";
import type { FunctionDef } from "py-ast";
import type { ApiAuthentication, ApiParameter } from "../../../models/endpoint";

export const fastapiScanner: FrameworkPlugin = {
  id: "fastapi",
  name: "FastAPI",
  languageId: "python",
  async detect(ctx) {
    const { detectPythonProject } = await import("../shared/project-detector");
    const project = await detectPythonProject(ctx.fs, ctx.projectPath);
    return hasPythonDependency(project.dependencies, "fastapi");
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
    const routes = await scanFastAPI(scanCtx);
    const { rawRoutesToEndpoints } = await import("../shared/types");
    return rawRoutesToEndpoints(routes, "fastapi");
  },
};

async function scanFastAPI(ctx: PythonScanContext): Promise<RawRoute[]> {
  const files = await discoverPythonFiles(ctx.fs, ctx.projectPath);
  const filePaths = files.map((f) => f.absolutePath);

  const modules = await Promise.all(
    filePaths.map(async (fp) => {
      const source = await ctx.fs.readFile(fp);
      return parsePythonSource(source, fp);
    }),
  );

  const validModules = modules.filter((m): m is NonNullable<typeof m> => m !== null);
  const schemas = extractSchemasFromModules(validModules);
  const moduleAuth = extractModuleAuthPatterns(validModules);

  const allMounts = validModules.flatMap((m) => extractRouterMounts(m, "fastapi"));
  const allIncludes = validModules.flatMap((m) => extractIncludeEdges(m));

  const routes: RawRoute[] = [];

  for (const mod of validModules) {
    const fileRoutes = extractFastAPIRoutesFromModule(mod, allMounts, allIncludes, {
      schemas: Array.from(schemas.values()),
      moduleAuth,
      extractHandler: (fn, path, method) =>
        buildFastAPIRoute(fn, path, method, mod.source, schemas, moduleAuth, mod.filePath),
    });
    routes.push(...fileRoutes);
  }

  return dedupeRoutes(routes);
}

function buildFastAPIRoute(
  fn: FunctionDef,
  path: string,
  method: string,
  source: string,
  schemas: Map<string, import("../shared/types").ClassSchema>,
  moduleAuth: import("../shared/auth-detector").AuthPattern[],
  sourceFile: string,
): RawRoute | null {
  const pathParams = extractPathParamsFromPattern(path);
  const queryParams: ApiParameter[] = [];
  let requestBody: import("../../../models/endpoint").ApiRequestBody | undefined;
  let isMultipart = false;

  for (const arg of fn.args.args) {
    const argName = arg.arg;
    if (argName === "self" || argName === "cls") continue;

    const annotation = arg.annotation;
    if (!annotation) continue;

    const typeName = getAttributeChain(annotation) ?? (isNodeType(annotation, "Name") ? (annotation as { id: string }).id : "any");

    if (pathParams.some((p) => p.name === argName)) continue;

    const defaultArg = fn.args.defaults[fn.args.args.indexOf(arg) - (fn.args.args.length - fn.args.defaults.length)];
    if (defaultArg && isDependsCall(defaultArg)) continue;

    if (isQueryParam(defaultArg, annotation)) {
      queryParams.push({
        name: argName,
        type: typeName,
        required: defaultArg === undefined,
        in: "query",
        example: String(exampleForType(typeName)),
      });
      continue;
    }

    if (isBodyParam(defaultArg, annotation, typeName)) {
      const schema = findSchemaByName(schemas, typeName);
      if (schema) {
        requestBody = schemaToRequestBody(schema);
      } else if (typeName.includes("UploadFile") || isFileUpload(defaultArg)) {
        isMultipart = true;
        requestBody = {
          contentType: "multipart/form-data",
          schema: { file: "" },
          example: undefined,
        };
      }
    } else if (!pathParams.some((p) => p.name === argName) && findSchemaByName(schemas, typeName)) {
      const schema = findSchemaByName(schemas, typeName)!;
      requestBody = schemaToRequestBody(schema);
    }
  }

  const fnSlice = extractFunctionSource(source, fn.name);
  const doc = parseDocstring(extractDocstringFromFunction(fn));

  const auth = extractAuthFromFunction(fn) ?? detectEndpointAuth(fnSlice, "", moduleAuth);

  return {
    method: method.toUpperCase() as import("../../../models/endpoint").HttpMethod,
    path,
    handler: fn.name,
    summary: doc.description?.split("\n")[0],
    description: doc.description,
    tags: [],
    folder: [],
    sourceFile,
    pathParameters: pathParams,
    queryParameters: queryParams,
    requestBody: isMultipart
      ? { contentType: "multipart/form-data", schema: { file: "" } }
      : requestBody,
    authentication: auth,
    responses: [{ statusCode: method.toLowerCase() === "post" ? 201 : 200 }],
    middleware: [],
    warnings: [],
  };
}

function isDependsCall(node: import("py-ast").ASTNodeUnion): boolean {
  if (!isNodeType(node, "Call")) return false;
  const target = getAttributeChain(node);
  return target?.endsWith("Depends") ?? false;
}

function isQueryParam(
  defaultArg: import("py-ast").ASTNodeUnion | undefined,
  annotation: import("py-ast").ASTNodeUnion,
): boolean {
  if (defaultArg && isNodeType(defaultArg, "Call")) {
    const t = getAttributeChain(defaultArg);
    if (t?.endsWith("Query")) return true;
  }
  const ann = getAttributeChain(annotation);
  return ann?.includes("Query") ?? false;
}

function isBodyParam(
  defaultArg: import("py-ast").ASTNodeUnion | undefined,
  _annotation: import("py-ast").ASTNodeUnion,
  typeName: string,
): boolean {
  if (defaultArg && isNodeType(defaultArg, "Call")) {
    const t = getAttributeChain(defaultArg);
    if (t?.endsWith("Body") || t?.endsWith("Form") || t?.endsWith("File")) return true;
  }
  return !["str", "int", "float", "bool"].includes(typeName);
}

function isFileUpload(defaultArg: import("py-ast").ASTNodeUnion | undefined): boolean {
  if (!defaultArg || !isNodeType(defaultArg, "Call")) return false;
  return getAttributeChain(defaultArg)?.endsWith("File") ?? false;
}

function extractDocstringFromFunction(fn: FunctionDef): string | undefined {
  const first = fn.body[0];
  if (!first || !isNodeType(first, "Expr")) return undefined;
  const expr = (first as { value: import("py-ast").ASTNodeUnion }).value;
  if (isNodeType(expr, "Constant") && typeof (expr as { value: unknown }).value === "string") {
    return (expr as { value: string }).value;
  }
  return undefined;
}

function extractAuthFromFunction(fn: FunctionDef): ApiAuthentication | undefined {
  const defaultsOffset = fn.args.args.length - fn.args.defaults.length;
  for (let i = 0; i < fn.args.args.length; i++) {
    const defaultArg = i >= defaultsOffset ? fn.args.defaults[i - defaultsOffset] : undefined;
    if (!defaultArg || !isDependsCall(defaultArg)) continue;
    const depName = getDependsName(defaultArg);
    if (depName && /auth|token|user|oauth|current|security/i.test(depName)) {
      return {
        type: "bearer",
        scheme: "Bearer",
        middleware: [depName],
        required: true,
      };
    }
  }
  return undefined;
}

function getDependsName(node: import("py-ast").ASTNodeUnion): string | undefined {
  if (!isNodeType(node, "Call")) return undefined;
  const args = (node as { args: import("py-ast").ASTNodeUnion[] }).args;
  if (args[0] && isNodeType(args[0], "Name")) {
    return (args[0] as { id: string }).id;
  }
  return getAttributeChain(args[0]);
}

function extractFunctionSource(source: string, name: string): string {
  const re = new RegExp(`(?:async\\s+)?def\\s+${name}\\s*\\([\\s\\S]*?(?=\\n(?:async\\s+)?def |\\nclass |$)`);
  const m = source.match(re);
  return m?.[0] ?? "";
}

function dedupeRoutes(routes: RawRoute[]): RawRoute[] {
  const seen = new Map<string, RawRoute>();
  for (const r of routes) {
    const key = `${r.method}:${r.path}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}
