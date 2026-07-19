import type { HttpMethod } from "../../../models/endpoint";
import type { RawRoute } from "./types";
import { stripJavaComments } from "./annotation-extractor";
import {
  extractPathParamsFromPattern,
  folderFromControllerName,
  humanizeMethodName,
  joinPaths,
  simplifySpringPath,
} from "./path-utils";

const MAPPING_RE =
  /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\(([^)]*)\))?/g;

const METHOD_BY_ANN: Record<string, HttpMethod> = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  PatchMapping: "PATCH",
  DeleteMapping: "DELETE",
};

/**
 * Regex fallback for Spring mapping methods when structured parse misses them.
 * Only runs on files that look like controllers.
 */
export function regexExtractSpringMappings(
  source: string,
  sourceFile: string,
  classPrefix = "",
  className = "Controller",
): RawRoute[] {
  if (!source.includes("@RestController") && !source.includes("@Controller")) {
    return [];
  }

  const cleaned = stripJavaComments(source);
  const routes: RawRoute[] = [];

  // Infer class-level RequestMapping prefix if not provided
  let prefix = classPrefix;
  if (!prefix) {
    const classReq = cleaned.match(
      /@RequestMapping\s*\(\s*(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/,
    );
    if (classReq) prefix = classReq[1];
  }

  const inferredClass =
    cleaned.match(/(?:public\s+)?(?:final\s+)?class\s+(\w+)/)?.[1] ?? className;

  let match: RegExpExecArray | null;
  const re = new RegExp(MAPPING_RE.source, "g");
  while ((match = re.exec(cleaned)) !== null) {
    const annName = match[1];
    const argsRaw = match[2] ?? "";
    const after = cleaned.slice(match.index + match[0].length, match.index + match[0].length + 400);

    // Find following method signature
    const methodSig = after.match(
      /(?:public|protected|private)\s+(?:static\s+)?[\w.<>,?[\]\s]+?\s+(\w+)\s*\(/,
    );
    if (!methodSig) continue;
    const handler = methodSig[1];

    const paths = extractPathsFromArgs(argsRaw);
    let methods: HttpMethod[] = [];
    if (annName === "RequestMapping") {
      methods = extractMethodsFromArgs(argsRaw);
      if (methods.length === 0) methods = ["GET"];
    } else {
      methods = [METHOD_BY_ANN[annName] ?? "GET"];
    }

    for (const pathPart of paths) {
      const joined = joinPaths(prefix, pathPart);
      const { path, warnings } = simplifySpringPath(joined);
      for (const method of methods) {
        routes.push({
          method,
          path,
          handler,
          summary: humanizeMethodName(handler),
          description: `Spring Boot ${inferredClass}.${handler}`,
          tags: [],
          folder: folderFromControllerName(inferredClass),
          sourceFile,
          controller: inferredClass,
          pathParameters: extractPathParamsFromPattern(path),
          queryParameters: [],
          headers: [],
          responses: [{ statusCode: method === "POST" ? 201 : 200 }],
          middleware: [],
          warnings,
        });
      }
    }
  }

  return dedupeRawRoutes(routes);
}

function extractPathsFromArgs(argsRaw: string): string[] {
  const trimmed = argsRaw.trim();
  if (!trimmed) return [""];

  const named =
    trimmed.match(/(?:path|value)\s*=\s*\{([^}]+)\}/) ??
    trimmed.match(/(?:path|value)\s*=\s*["']([^"']+)["']/);
  if (named) {
    if (named[0].includes("{")) {
      return [...named[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    }
    return [named[1]];
  }

  const single = trimmed.match(/^["']([^"']+)["']$/);
  if (single) return [single[1]];

  const arr = trimmed.match(/^\{([^}]+)\}$/);
  if (arr) {
    return [...arr[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  }

  return [""];
}

function extractMethodsFromArgs(argsRaw: string): HttpMethod[] {
  const methods: HttpMethod[] = [];
  for (const m of argsRaw.matchAll(/RequestMethod\.(\w+)/g)) {
    methods.push(m[1].toUpperCase() as HttpMethod);
  }
  return methods;
}

function dedupeRawRoutes(routes: RawRoute[]): RawRoute[] {
  const seen = new Map<string, RawRoute>();
  for (const r of routes) {
    const key = `${r.method}:${r.path}:${r.handler ?? ""}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}
