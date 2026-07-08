import type { FrameworkPlugin } from "../../../core/types";
import type { PythonScanContext, RawRoute } from "../shared/types";
import { hasPythonDependency } from "../shared/project-detector";
import { discoverPythonFiles } from "../../../utils/python-file-discovery";
import { parsePythonSource, walkPythonAst } from "../../../parsers/ast/python-parser";
import { extractPathParamsFromPattern, extractSchemasFromModules, findSchemaByName, schemaToRequestBody } from "../shared/schema-extractor";
import { detectEndpointAuth, extractModuleAuthPatterns } from "../shared/auth-detector";
import { djangoPathToOpenApi, getAttributeChain, getStringFromNode, isNodeType, normalizePath, toHttpMethod } from "../shared/ast-utils";
import { regexExtractDjangoUrls } from "../shared/regex-fallback";
import type { ASTNodeUnion, Call } from "py-ast";

export const djangoScanner: FrameworkPlugin = {
  id: "django",
  name: "Django REST Framework",
  languageId: "python",
  async detect(ctx) {
    const { detectPythonProject } = await import("../shared/project-detector");
    const project = await detectPythonProject(ctx.fs, ctx.projectPath);
    return (
      hasPythonDependency(project.dependencies, "django") ||
      hasPythonDependency(project.dependencies, "djangorestframework")
    );
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
    const routes = await scanDjango(scanCtx);
    const { rawRoutesToEndpoints } = await import("../shared/types");
    return rawRoutesToEndpoints(routes, "django");
  },
};

async function scanDjango(ctx: PythonScanContext): Promise<RawRoute[]> {
  const files = await discoverPythonFiles(ctx.fs, ctx.projectPath);

  const urlFiles = files.filter((f) => f.relativePath.endsWith("urls.py"));
  const viewFiles = files.filter(
    (f) => f.relativePath.includes("views") || f.relativePath.includes("viewsets"),
  );

  const routes: RawRoute[] = [];
  const schemas = new Map<string, import("../shared/types").ClassSchema>();

  for (const file of [...urlFiles, ...viewFiles, ...files.slice(0, 100)]) {
    let source: string;
    try {
      source = await ctx.fs.readFile(file.absolutePath);
    } catch {
      continue;
    }
    const mod = parsePythonSource(source, file.absolutePath);
    if (!mod) continue;

    const fileSchemas = extractSchemasFromModules([mod]);
    for (const [k, v] of fileSchemas) schemas.set(k, v);
    const moduleAuth = extractModuleAuthPatterns([mod]);

    if (file.relativePath.endsWith("urls.py")) {
      routes.push(...extractDjangoUrlPatterns(mod, "", moduleAuth));
      routes.push(...regexExtractDjangoUrls(source, file.absolutePath));
    }

    routes.push(...extractDRFViewSets(mod, schemas, moduleAuth));
    routes.push(...extractDRFAPIViews(mod, schemas, moduleAuth));
  }

  return dedupeRoutes(routes);
}

function extractDjangoUrlPatterns(
  mod: import("../../../parsers/ast/python-parser").ParsedPythonModule,
  parentPrefix: string,
  moduleAuth: import("../shared/auth-detector").AuthPattern[],
): RawRoute[] {
  const routes: RawRoute[] = [];

  walkPythonAst(mod.ast, (node) => {
    if (!isNodeType(node, "Call")) return;
    const call = node as Call;
    const target = getAttributeChain(call.func);
    if (target !== "path" && target !== "re_path") return;

    const subPath = getStringFromNode(call.args[0]) ?? "";
    const viewNode = call.args[1];
    const fullPath = normalizePath(parentPrefix, djangoPathToOpenApi(subPath));

    const viewName = viewNode ? getAttributeChain(viewNode) ?? getStringFromNode(viewNode) : undefined;
    const methods = inferMethodsFromView(viewName ?? "", mod.source);

    for (const method of methods) {
      routes.push({
        method,
        path: fullPath,
        handler: viewName,
        tags: [],
        folder: inferFolderFromPath(fullPath),
        sourceFile: mod.filePath,
        pathParameters: extractPathParamsFromPattern(fullPath),
        queryParameters: [],
        authentication: detectEndpointAuth(mod.source, "", moduleAuth),
        responses: [{ statusCode: 200 }],
        middleware: [],
        warnings: [],
      });
    }

    if (viewNode && isNodeType(viewNode, "Call")) {
      const inner = viewNode as Call;
      if (getAttributeChain(inner.func)?.endsWith("include")) {
        // nested include — prefix only
      }
    }
  });

  return routes;
}

function extractDRFViewSets(
  mod: import("../../../parsers/ast/python-parser").ParsedPythonModule,
  schemas: Map<string, import("../shared/types").ClassSchema>,
  moduleAuth: import("../shared/auth-detector").AuthPattern[],
): RawRoute[] {
  const routes: RawRoute[] = [];

  walkPythonAst(mod.ast, (node) => {
    if (!isNodeType(node, "ClassDef")) return;
    const cls = node as { name: string; bases: ASTNodeUnion[]; body: ASTNodeUnion[] };
    const bases = cls.bases.map((b) => getAttributeChain(b) ?? "").join(" ");
    if (!bases.includes("ViewSet") && !bases.includes("ModelViewSet")) return;

    const basePath = `/${cls.name.toLowerCase().replace(/viewset$/, "")}`;
    const actions = [
      { method: "GET" as const, path: basePath, action: "list" },
      { method: "POST" as const, path: basePath, action: "create" },
      { method: "GET" as const, path: `${basePath}/{id}`, action: "retrieve" },
      { method: "PUT" as const, path: `${basePath}/{id}`, action: "update" },
      { method: "PATCH" as const, path: `${basePath}/{id}`, action: "partial_update" },
      { method: "DELETE" as const, path: `${basePath}/{id}`, action: "destroy" },
    ];

    let serializerBody: import("../../../models/endpoint").ApiRequestBody | undefined;
    for (const stmt of cls.body) {
      if (!isNodeType(stmt, "Assign")) continue;
      const assign = stmt as { targets: ASTNodeUnion[]; value: ASTNodeUnion };
      const target = assign.targets[0];
      if (isNodeType(target, "Name") && (target as { id: string }).id === "serializer_class") {
        const schemaName = getAttributeChain(assign.value) ?? (isNodeType(assign.value, "Name") ? (assign.value as { id: string }).id : undefined);
        if (schemaName) {
          const schema = findSchemaByName(schemas, schemaName);
          if (schema) serializerBody = schemaToRequestBody(schema);
        }
      }
    }

    for (const action of actions) {
      routes.push({
        method: action.method,
        path: action.path,
        handler: `${cls.name}.${action.action}`,
        tags: [cls.name],
        folder: [cls.name.replace(/ViewSet$/, "")],
        sourceFile: mod.filePath,
        pathParameters: extractPathParamsFromPattern(action.path),
        queryParameters: [],
        requestBody: action.method === "POST" || action.method === "PUT" || action.method === "PATCH" ? serializerBody : undefined,
        authentication: detectEndpointAuth(mod.source, "", moduleAuth),
        responses: [{ statusCode: action.method === "POST" ? 201 : 200 }],
        middleware: [],
        warnings: [],
      });
    }
  });

  return routes;
}

function extractDRFAPIViews(
  mod: import("../../../parsers/ast/python-parser").ParsedPythonModule,
  _schemas: Map<string, import("../shared/types").ClassSchema>,
  moduleAuth: import("../shared/auth-detector").AuthPattern[],
): RawRoute[] {
  const routes: RawRoute[] = [];

  walkPythonAst(mod.ast, (node) => {
    if (!isNodeType(node, "ClassDef")) return;
    const cls = node as { name: string; bases: ASTNodeUnion[]; body: ASTNodeUnion[] };
    const bases = cls.bases.map((b) => getAttributeChain(b) ?? "").join(" ");
    if (!bases.includes("APIView") && !bases.includes("GenericAPIView")) return;

    const methods = ["get", "post", "put", "patch", "delete"];
    const basePath = `/${cls.name.toLowerCase().replace(/view$/, "")}`;

    for (const m of methods) {
      const hasMethod = cls.body.some(
        (stmt) =>
          (isNodeType(stmt, "FunctionDef") || isNodeType(stmt, "AsyncFunctionDef")) &&
          (stmt as { name: string }).name === m,
      );
      if (!hasMethod) continue;

      routes.push({
        method: toHttpMethod(m),
        path: basePath,
        handler: `${cls.name}.${m}`,
        tags: [cls.name],
        folder: [cls.name.replace(/View$/, "")],
        sourceFile: mod.filePath,
        pathParameters: [],
        queryParameters: [],
        authentication: detectEndpointAuth(mod.source, "", moduleAuth),
        responses: [{ statusCode: m === "post" ? 201 : 200 }],
        middleware: [],
        warnings: [],
      });
    }
  });

  return routes;
}

function inferMethodsFromView(
  viewName: string,
  _source: string,
): import("../../../models/endpoint").HttpMethod[] {
  if (/ListAPIView|RetrieveAPIView|ListModelMixin/.test(viewName)) return ["GET"];
  if (/CreateAPIView|CreateModelMixin/.test(viewName)) return ["POST"];
  if (/UpdateAPIView|UpdateModelMixin/.test(viewName)) return ["PUT", "PATCH"];
  if (/DestroyAPIView|DestroyModelMixin/.test(viewName)) return ["DELETE"];
  if (/ViewSet|ModelViewSet/.test(viewName)) return ["GET", "POST", "PUT", "PATCH", "DELETE"];
  if (/APIView/.test(viewName)) return ["GET", "POST", "PUT", "PATCH", "DELETE"];
  return ["GET"];
}

function inferFolderFromPath(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return ["General"];
  return [parts[0].charAt(0).toUpperCase() + parts[0].slice(1)];
}

function dedupeRoutes(routes: RawRoute[]): RawRoute[] {
  const seen = new Map<string, RawRoute>();
  for (const r of routes) {
    const key = `${r.method}:${r.path}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}
