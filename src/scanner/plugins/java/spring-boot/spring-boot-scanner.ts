import type { FrameworkPlugin } from "../../../core/types";
import type {
  ApiParameter,
  ApiRequestBody,
  HttpMethod,
} from "../../../models/endpoint";
import type {
  ClassSchema,
  JavaScanContext,
  ParsedAnnotation,
  ParsedControllerMethod,
  ParsedMethodParam,
  RawRoute,
} from "../shared/types";
import { rawRoutesToEndpoints } from "../shared/types";
import {
  detectJavaProject,
  hasSpringDependency,
} from "../shared/project-detector";
import { discoverJavaFiles } from "../../../utils/java-file-discovery";
import {
  findAnnotation,
  getAnnotationPaths,
  getHttpMethodsFromAnnotation,
  isMappingAnnotation,
  parseJavaControllers,
  annotationHas,
} from "../shared/annotation-extractor";
import {
  applyGlobalPrefix,
  extractPathParamsFromPattern,
  folderFromControllerName,
  humanizeMethodName,
  joinPaths,
  simplifySpringPath,
} from "../shared/path-utils";
import {
  emptyJsonBody,
  extractSchemasFromJavaSources,
  findSchemaByName,
  schemaToFormUrlEncodedBody,
  schemaToRequestBody,
} from "../shared/dto-schema-extractor";
import { detectMethodAuth } from "../shared/auth-detector";
import { regexExtractSpringMappings } from "../shared/regex-fallback";

const IGNORED_PARAM_TYPES = new Set([
  "HttpServletRequest",
  "HttpServletResponse",
  "ServletRequest",
  "ServletResponse",
  "Principal",
  "Authentication",
  "BindingResult",
  "Errors",
  "Locale",
  "UriComponentsBuilder",
  "Model",
  "ModelMap",
  "RedirectAttributes",
  "HttpSession",
  "WebRequest",
  "NativeWebRequest",
]);

const SIMPLE_PARAM_TYPES = new Set([
  "String",
  "string",
  "int",
  "Integer",
  "long",
  "Long",
  "short",
  "Short",
  "byte",
  "Byte",
  "char",
  "Character",
  "boolean",
  "Boolean",
  "float",
  "Float",
  "double",
  "Double",
  "BigDecimal",
  "BigInteger",
  "UUID",
  "LocalDate",
  "LocalDateTime",
  "Instant",
  "Date",
  "Object",
]);

function isBodyCapableMethod(methods: string[]): boolean {
  return methods.some((m) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(m.toUpperCase()),
  );
}

export const springBootScanner: FrameworkPlugin = {
  id: "spring-boot",
  name: "Spring Boot",
  languageId: "java",
  async detect(ctx) {
    const project =
      ctx.javaProject != null
        ? {
            dependencies: ctx.javaProject.dependencies,
            warnings: [] as string[],
          }
        : await detectJavaProject(ctx.fs, ctx.projectPath);

    if (hasSpringDependency(project.dependencies as Record<string, string>)) {
      return true;
    }

    // Fallback: scan a few Java files for Spring markers
    const files = await discoverJavaFiles(ctx.fs, ctx.projectPath, {
      maxFiles: 80,
    });
    for (const file of files.slice(0, 40)) {
      try {
        const source = await ctx.fs.readFile(file.absolutePath);
        if (
          source.includes("@SpringBootApplication") ||
          source.includes("@RestController") ||
          source.includes("org.springframework")
        ) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  },
  async scan(ctx) {
    const project =
      ctx.javaProject != null
        ? await enrichFromManifest(ctx)
        : await detectJavaProject(ctx.fs, ctx.projectPath);

    const scanCtx: JavaScanContext = {
      projectPath: ctx.projectPath,
      fs: ctx.fs,
      options: ctx.options,
      project,
      onProgress: ctx.onProgress,
    };

    const routes = await scanSpringBoot(scanCtx);
    return rawRoutesToEndpoints(routes, "spring-boot");
  },
};

async function enrichFromManifest(
  ctx: Parameters<FrameworkPlugin["scan"]>[0],
): Promise<import("../shared/types").JavaProjectInfo> {
  const full = await detectJavaProject(ctx.fs, ctx.projectPath);
  if (!ctx.javaProject) return full;
  const sourceRoots =
    ctx.javaProject.sourceRoots && ctx.javaProject.sourceRoots.length > 0
      ? ctx.javaProject.sourceRoots
      : full.sourceRoots;
  const entryClasses =
    ctx.javaProject.entryClasses && ctx.javaProject.entryClasses.length > 0
      ? ctx.javaProject.entryClasses
      : full.entryClasses;
  return {
    ...full,
    dependencies: {
      ...full.dependencies,
      ...ctx.javaProject.dependencies,
    },
    contextPath: ctx.javaProject.contextPath ?? full.contextPath,
    servletPath: ctx.javaProject.servletPath ?? full.servletPath,
    springBootVersion: ctx.javaProject.springBootVersion ?? full.springBootVersion,
    sourceRoots,
    entryClasses,
  };
}

async function scanSpringBoot(ctx: JavaScanContext): Promise<RawRoute[]> {
  const files = await discoverJavaFiles(ctx.fs, ctx.projectPath, {
    maxFiles: ctx.options.maxFiles,
    includePatterns: ctx.options.includePatterns,
    excludePatterns: ctx.options.excludePatterns,
  });

  ctx.onProgress?.({
    stage: "discovering-files",
    message: `Discovered ${files.length} Java files...`,
    percent: 25,
    totalFiles: files.length,
  });

  const sources: Array<{ source: string; sourceFile: string; absolutePath: string }> = [];
  const warnings: string[] = [...ctx.project.warnings];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const source = await ctx.fs.readFile(file.absolutePath);
      sources.push({
        source,
        sourceFile: file.relativePath.replace(/\\/g, "/"),
        absolutePath: file.absolutePath,
      });
    } catch (err) {
      warnings.push(
        `Failed to read ${file.relativePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (i % 25 === 0) {
      ctx.onProgress?.({
        stage: "parsing",
        message: `Reading Java sources (${i + 1}/${files.length})...`,
        percent: 25 + Math.round((i / Math.max(files.length, 1)) * 20),
        filesProcessed: i + 1,
        totalFiles: files.length,
      });
    }
  }

  const schemas = extractSchemasFromJavaSources(sources);
  const routes: RawRoute[] = [];

  for (const file of sources) {
    try {
      const structured = extractFromStructuredParse(
        file.source,
        file.sourceFile,
        schemas,
        ctx.project.contextPath,
        ctx.project.servletPath,
      );
      routes.push(...structured);

      // Regex fallback for files that look like controllers but yielded nothing
      if (
        structured.length === 0 &&
        (file.source.includes("@RestController") || file.source.includes("@GetMapping"))
      ) {
        const fallback = regexExtractSpringMappings(file.source, file.sourceFile);
        for (const route of fallback) {
          route.path = applyGlobalPrefix(
            route.path,
            ctx.project.contextPath,
            ctx.project.servletPath,
          );
          routes.push(route);
        }
      }
    } catch (err) {
      warnings.push(
        `Spring Boot scan failed for ${file.sourceFile}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Attach file-level warnings onto a synthetic note via first route if needed — keep on project
  if (warnings.length > 0 && routes.length > 0) {
    routes[0] = {
      ...routes[0],
      warnings: [...routes[0].warnings, ...warnings.slice(0, 5)],
    };
  }

  return dedupeRoutes(routes);
}

function extractFromStructuredParse(
  source: string,
  sourceFile: string,
  schemas: Map<string, ClassSchema>,
  contextPath?: string,
  servletPath?: string,
): RawRoute[] {
  const controllers = parseJavaControllers(source, sourceFile);
  const routes: RawRoute[] = [];

  for (const controller of controllers) {
    const classMapping = controller.annotations.find((a) => a.name === "RequestMapping");
    const classPaths = classMapping ? getAnnotationPaths(classMapping) : [""];
    const classPrefix = classPaths[0] ?? "";
    const folder = folderFromControllerName(controller.name);

    for (const method of controller.methods) {
      routes.push(
        ...buildRoutesForMethod(
          method,
          controller.annotations,
          classPrefix,
          controller.name,
          folder,
          sourceFile,
          schemas,
          contextPath,
          servletPath,
        ),
      );
    }
  }

  return routes;
}

function buildRoutesForMethod(
  method: ParsedControllerMethod,
  classAnnotations: ParsedAnnotation[],
  classPrefix: string,
  controllerName: string,
  folder: string[],
  sourceFile: string,
  schemas: Map<string, ClassSchema>,
  contextPath?: string,
  servletPath?: string,
): RawRoute[] {
  const mappingAnns = method.annotations.filter((a) => isMappingAnnotation(a.name));
  if (mappingAnns.length === 0) return [];

  const { authentication, middleware } = detectMethodAuth(
    method.annotations,
    classAnnotations,
  );

  const declaredMethods = mappingAnns.flatMap((ann) =>
    getHttpMethodsFromAnnotation(ann),
  );

  const { pathParameters, queryParameters, headers, requestBody, paramWarnings } =
    extractMethodParameters(method.params, schemas, declaredMethods);

  const responseStatus = resolveResponseStatus(method);
  const routes: RawRoute[] = [];

  for (const ann of mappingAnns) {
    const paths = getAnnotationPaths(ann);
    const httpMethods = getHttpMethodsFromAnnotation(ann) as HttpMethod[];

    for (const pathPart of paths) {
      const joined = joinPaths(classPrefix, pathPart);
      const { path: simplified, warnings: pathWarnings } = simplifySpringPath(joined);
      const fullPath = applyGlobalPrefix(simplified, contextPath, servletPath);
      const fromPattern = extractPathParamsFromPattern(fullPath);
      const mergedPathParams = mergePathParams(fromPattern, pathParameters);

      for (const httpMethod of httpMethods) {
        routes.push({
          method: httpMethod,
          path: fullPath,
          handler: method.name,
          summary: humanizeMethodName(method.name),
          description: `Spring Boot ${controllerName}.${method.name}`,
          tags: [],
          folder,
          sourceFile,
          controller: controllerName,
          lineNumber: method.lineNumber,
          pathParameters: mergedPathParams,
          queryParameters,
          headers,
          requestBody,
          authentication,
          responses: [{ statusCode: responseStatus ?? defaultStatus(httpMethod, method.name) }],
          middleware,
          warnings: [...pathWarnings, ...paramWarnings],
        });
      }
    }
  }

  return routes;
}

function extractMethodParameters(
  params: ParsedMethodParam[],
  schemas: Map<string, ClassSchema>,
  httpMethods: string[] = [],
): {
  pathParameters: ApiParameter[];
  queryParameters: ApiParameter[];
  headers: ApiParameter[];
  requestBody?: ApiRequestBody;
  paramWarnings: string[];
} {
  const pathParameters: ApiParameter[] = [];
  const queryParameters: ApiParameter[] = [];
  const headers: ApiParameter[] = [];
  const paramWarnings: string[] = [];
  let requestBody: ApiRequestBody | undefined;
  const allowInferredBody = isBodyCapableMethod(httpMethods);

  for (const param of params) {
    const simpleType = param.type.replace(/<.*>/, "").split(".").pop() ?? param.type;
    if (IGNORED_PARAM_TYPES.has(simpleType)) continue;

    // Pageable → common query params
    if (simpleType === "Pageable" || simpleType === "PageRequest") {
      queryParameters.push(
        { name: "page", type: "integer", required: false, in: "query", example: 0 },
        { name: "size", type: "integer", required: false, in: "query", example: 20 },
        { name: "sort", type: "string", required: false, in: "query", example: "id,asc" },
      );
      continue;
    }

    if (annotationHas(param.annotations, "PathVariable")) {
      const ann = findAnnotation(param.annotations, "PathVariable")!;
      const name =
        (typeof ann.args.value === "string" && ann.args.value) ||
        (typeof ann.args.name === "string" && ann.args.name) ||
        param.name;
      pathParameters.push({
        name: String(name),
        type: simpleType,
        required: ann.args.required !== false,
        in: "path",
        example: name === "id" || String(name).endsWith("Id") ? "1" : String(name),
      });
      continue;
    }

    if (annotationHas(param.annotations, "RequestParam")) {
      const ann = findAnnotation(param.annotations, "RequestParam")!;
      const name =
        (typeof ann.args.value === "string" && ann.args.value) ||
        (typeof ann.args.name === "string" && ann.args.name) ||
        param.name;
      queryParameters.push({
        name: String(name),
        type: simpleType,
        required: ann.args.required !== false,
        in: "query",
        example:
          typeof ann.args.defaultValue === "string"
            ? ann.args.defaultValue
            : simpleType === "boolean" || simpleType === "Boolean"
              ? false
              : "",
      });
      continue;
    }

    if (annotationHas(param.annotations, "RequestHeader")) {
      const ann = findAnnotation(param.annotations, "RequestHeader")!;
      const name =
        (typeof ann.args.value === "string" && ann.args.value) ||
        (typeof ann.args.name === "string" && ann.args.name) ||
        param.name;
      headers.push({
        name: String(name),
        type: simpleType,
        required: ann.args.required !== false,
        in: "header",
        example: "",
      });
      continue;
    }

    if (annotationHas(param.annotations, "RequestBody")) {
      requestBody = resolveBodyFromType(param.type, schemas, "json", paramWarnings);
      continue;
    }

    if (annotationHas(param.annotations, "ModelAttribute")) {
      const schema = findSchemaByName(schemas, param.type);
      if (allowInferredBody || isBodyCapableMethod(httpMethods)) {
        requestBody = resolveBodyFromType(param.type, schemas, "form", paramWarnings);
      } else if (schema) {
        for (const field of schema.fields) {
          if (
            field.type.startsWith("List") ||
            field.type.startsWith("Set") ||
            field.type.startsWith("Map") ||
            field.type.includes("<")
          ) {
            continue;
          }
          queryParameters.push({
            name: field.name,
            type: field.type,
            required: field.required,
            in: "query",
            example: field.type === "int" || field.type === "Integer" || field.type === "Long"
              ? 0
              : "",
          });
        }
      } else {
        paramWarnings.push(
          `ModelAttribute type '${param.type}' not found for query field expansion`,
        );
      }
      continue;
    }

    if (
      annotationHas(param.annotations, "RequestPart") ||
      (annotationHas(param.annotations, "RequestParam") &&
        (simpleType === "MultipartFile" || simpleType === "Part"))
    ) {
      requestBody = {
        contentType: "multipart/form-data",
        schema: { [param.name]: "" },
      };
      continue;
    }

    if (simpleType === "MultipartFile" || simpleType === "Part") {
      requestBody = {
        contentType: "multipart/form-data",
        schema: { [param.name]: "" },
      };
      continue;
    }

    // Spring binds unannotated complex types as @ModelAttribute on form POSTs
    if (
      !requestBody &&
      allowInferredBody &&
      param.annotations.length === 0 &&
      !SIMPLE_PARAM_TYPES.has(simpleType)
    ) {
      requestBody = resolveBodyFromType(param.type, schemas, "form", paramWarnings);
    }
  }

  return { pathParameters, queryParameters, headers, requestBody, paramWarnings };
}

function resolveBodyFromType(
  typeName: string,
  schemas: Map<string, ClassSchema>,
  style: "json" | "form",
  warnings: string[],
): ApiRequestBody {
  const schema = findSchemaByName(schemas, typeName);
  if (schema && schema.fields.length > 0) {
    return style === "form"
      ? schemaToFormUrlEncodedBody(schema)
      : schemaToRequestBody(schema);
  }
  if (style === "form") {
    warnings.push(
      `Form model '${typeName}' fields not found; using empty form body`,
    );
    return {
      contentType: "application/x-www-form-urlencoded",
      schema: {},
      example: "",
    };
  }
  const empty = emptyJsonBody(
    `DTO schema not found for type '${typeName}'; using empty JSON body`,
  );
  warnings.push(...empty.warnings);
  return empty.body;
}

function mergePathParams(
  fromPattern: ApiParameter[],
  fromAnnotations: ApiParameter[],
): ApiParameter[] {
  const map = new Map<string, ApiParameter>();
  for (const p of fromPattern) map.set(p.name, p);
  for (const p of fromAnnotations) map.set(p.name, p);
  return Array.from(map.values());
}

function resolveResponseStatus(method: ParsedControllerMethod): number | undefined {
  const ann = findAnnotation(method.annotations, "ResponseStatus");
  if (!ann) return undefined;
  const code = ann.args.value ?? ann.args.code;
  if (typeof code === "string") {
    const named: Record<string, number> = {
      OK: 200,
      CREATED: 201,
      ACCEPTED: 202,
      NO_CONTENT: 204,
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
    };
    const upper = code.replace(/HttpStatus\./g, "").toUpperCase();
    if (upper in named) return named[upper];
    const num = Number(upper);
    if (!Number.isNaN(num)) return num;
  }
  return undefined;
}

function defaultStatus(method: HttpMethod, handlerName: string): number {
  if (method === "POST" || /^create/i.test(handlerName)) return 201;
  if (method === "DELETE") return 204;
  return 200;
}

function dedupeRoutes(routes: RawRoute[]): RawRoute[] {
  const seen = new Map<string, RawRoute>();
  for (const r of routes) {
    const key = `${r.method}:${r.path}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}
