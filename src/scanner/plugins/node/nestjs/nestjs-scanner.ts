import type { FrameworkPlugin } from "../../../core/types";
import type { ApiEndpoint, HttpMethod } from "../../../models/endpoint";
import { getAllDependencies, discoverSourceFiles } from "../../../utils/file-discovery";
import {
  traverseAst,
  buildPathParameters,
  detectAuthFromMiddleware,
  getStringLiteral,
  normalizeRoutePath,
} from "../../../parsers/analysis/extractors";
import { extractNestMethodBody } from "../../../parsers/analysis/nestjs-body-extractor";
import { parseFileToCache } from "../../../parsers/analysis/handler-resolver";
import * as t from "@babel/types";
import type { NodePath } from "@babel/traverse";
import { generateId } from "@/utils/id";

const HTTP_DECORATORS = new Set([
  "Get", "Post", "Put", "Patch", "Delete", "Options", "Head", "All",
]);

export const nestjsScanner: FrameworkPlugin = {
  id: "nestjs",
  name: "NestJS",
  languageId: "node",
  async detect(ctx) {
    if (!ctx.packageJson) return false;
    const deps = getAllDependencies(ctx.packageJson);
    return "@nestjs/core" in deps || "@nestjs/common" in deps;
  },
  async scan(ctx) {
    const endpoints: ApiEndpoint[] = [];
    const files = await discoverSourceFiles(ctx.fs, ctx.projectPath, {
      maxFiles: ctx.options.maxFiles,
    });
    const fileIndex = new Set(
      files.map((f) => f.relativePath.replace(/\\/g, "/")),
    );
    const fileCache = new Map<string, NonNullable<ReturnType<typeof parseFileToCache>>>();

    for (const file of files) {
      let code: string;
      try {
        code = await ctx.fs.readFile(file.absolutePath);
      } catch {
        continue;
      }

      const rel = file.relativePath.replace(/\\/g, "/");
      const parsed = parseFileToCache(code, rel);
      if (parsed) fileCache.set(rel, parsed);
    }

    for (const file of files) {
      const rel = file.relativePath.replace(/\\/g, "/");
      const parsed = fileCache.get(rel);
      if (!parsed) continue;

      let code: string;
      try {
        code = await ctx.fs.readFile(file.absolutePath);
      } catch {
        continue;
      }
      if (!code.includes("@Controller") && !code.includes("@Get")) continue;

      let controllerPrefix = "";

      traverseAst(parsed, {
        ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
          controllerPrefix = "";
          const decorators = path.node.decorators ?? [];
          for (const dec of decorators) {
            if (!t.isCallExpression(dec.expression)) continue;
            const callee = dec.expression.callee;
            if (t.isIdentifier(callee) && callee.name === "Controller") {
              controllerPrefix = getStringLiteral(dec.expression.arguments[0]) ?? "";
            }
          }

          const className = path.node.id?.name ?? "Controller";
          const folder = [className.replace(/Controller$/, "")];

          path.node.body.body.forEach((member) => {
            if (!t.isClassMethod(member) && !t.isClassProperty(member)) return;
            const methodDecorators = member.decorators ?? [];
            for (const dec of methodDecorators) {
              if (!t.isCallExpression(dec.expression)) continue;
              const callee = dec.expression.callee;
              if (!t.isIdentifier(callee) || !HTTP_DECORATORS.has(callee.name)) continue;

              const routePath = getStringLiteral(dec.expression.arguments[0]) ?? "";
              const fullPath = normalizeRoutePath(routePath, controllerPrefix);
              const httpMethod = callee.name.toUpperCase() === "ALL" ? "GET" : callee.name.toUpperCase();
              const methodName = t.isIdentifier(member.key) ? member.key.name : "handler";
              const displayName = methodName
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (c) => c.toUpperCase())
                .trim();

              const useGuards = member.decorators?.filter((d) => {
                if (!t.isCallExpression(d.expression)) return false;
                const c = d.expression.callee;
                return t.isIdentifier(c) && c.name === "UseGuards";
              });

              const middleware = useGuards?.length
                ? [{ name: "UseGuards", type: "auth" as const }]
                : [];

              const requestBody =
                t.isClassMethod(member)
                  ? extractNestMethodBody(
                      member,
                      parsed,
                      fileCache,
                      fileIndex,
                    )
                  : undefined;

              endpoints.push({
                id: generateId(),
                name: displayName || methodName,
                method: httpMethod as HttpMethod,
                path: fullPath,
                description: `NestJS ${className}.${methodName}`,
                tags: ["nestjs", ...folder],
                folder,
                headers: [],
                authentication: detectAuthFromMiddleware(middleware) ?? undefined,
                queryParameters: [],
                pathParameters: buildPathParameters(fullPath),
                requestBody,
                responses: [{ statusCode: 200 }],
                middleware,
                sourceFile: file.relativePath,
                controller: className,
                handler: methodName,
                lineNumber: member.loc?.start.line,
                framework: "nestjs",
                warnings: [],
              });
            }
          });
        },
      });
    }

    return endpoints;
  },
};
