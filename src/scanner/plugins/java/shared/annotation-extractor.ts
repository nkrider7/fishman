import type {
  AnnotationArgMap,
  ParsedAnnotation,
  ParsedControllerClass,
  ParsedControllerMethod,
  ParsedMethodParam,
} from "./types";

const MAPPING_ANNOTATIONS = new Set([
  "GetMapping",
  "PostMapping",
  "PutMapping",
  "PatchMapping",
  "DeleteMapping",
  "RequestMapping",
]);

const HTTP_METHOD_BY_ANNOTATION: Record<string, string[]> = {
  GetMapping: ["GET"],
  PostMapping: ["POST"],
  PutMapping: ["PUT"],
  PatchMapping: ["PATCH"],
  DeleteMapping: ["DELETE"],
};

/** Strip line and block comments while preserving newlines for line numbers. */
export function stripJavaComments(source: string): string {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") {
        result += " ";
        i++;
      }
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      result += "  ";
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        result += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < source.length) {
        result += "  ";
        i += 2;
      }
      continue;
    }
    if (source[i] === '"') {
      result += '"';
      i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\" && i + 1 < source.length) {
          result += source[i] + source[i + 1];
          i += 2;
          continue;
        }
        result += source[i];
        i++;
      }
      if (i < source.length) {
        result += '"';
        i++;
      }
      continue;
    }
    result += source[i];
    i++;
  }
  return result;
}

/** Scan annotations using parentheses balancing — no nested regex backtracking. */
export function scanAnnotations(source: string, from = 0, to = source.length): ParsedAnnotation[] {
  const annotations: ParsedAnnotation[] = [];
  let i = from;
  while (i < to) {
    while (i < to && /\s/.test(source[i])) i++;
    if (i >= to || source[i] !== "@") break;

    const nameStart = i + 1;
    let nameEnd = nameStart;
    while (nameEnd < to && /[\w.]/.test(source[nameEnd])) nameEnd++;
    if (nameEnd === nameStart) break;

    const fullName = source.slice(nameStart, nameEnd);
    const name = fullName.includes(".")
      ? fullName.slice(fullName.lastIndexOf(".") + 1)
      : fullName;

    i = nameEnd;
    while (i < to && /\s/.test(source[i])) i++;

    let argsRaw = "";
    let rawEnd = i;
    if (i < to && source[i] === "(") {
      const close = findMatchingParen(source, i);
      if (close < 0) {
        // Unbalanced — stop annotation scan for this block
        break;
      }
      argsRaw = source.slice(i + 1, close);
      rawEnd = close + 1;
      i = close + 1;
    }

    annotations.push({
      name,
      args: parseAnnotationArgs(argsRaw),
      raw: source.slice(nameStart - 1, rawEnd),
      startIndex: nameStart - 1,
    });
  }
  return annotations;
}

export function parseAnnotationsAt(source: string, start: number, end: number): ParsedAnnotation[] {
  return scanAnnotations(source, start, end);
}

export function parseAnnotationArgs(argsRaw: string): AnnotationArgMap {
  const args: AnnotationArgMap = {};
  const trimmed = argsRaw.trim();
  if (!trimmed) return args;

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    args.value = unquote(trimmed);
    return args;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}") && !trimmed.includes("=")) {
    args.value = parseStringArray(trimmed);
    return args;
  }

  const parts = splitTopLevelArgs(trimmed);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      if (!args.value) {
        if (part.startsWith("{")) args.value = parseStringArray(part);
        else args.value = unquote(part);
      }
      continue;
    }
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (value.startsWith("{")) {
      args[key] = parseStringArray(value);
    } else if (value === "true" || value === "false") {
      args[key] = value === "true";
    } else {
      args[key] = unquote(value);
    }
  }

  return args;
}

function splitTopLevelArgs(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      current += ch;
      if (ch === "\\" && i + 1 < input.length) {
        current += input[++i];
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === "{" || ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === "}" || ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseStringArray(raw: string): string[] {
  const inner = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  if (!inner.trim()) return [];
  return splitTopLevelArgs(inner).map(unquote).filter(Boolean);
}

function unquote(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  const rm = v.match(/RequestMethod\.(\w+)/);
  if (rm) return rm[1];
  return v;
}

export function getAnnotationPaths(ann: ParsedAnnotation): string[] {
  const candidates = [ann.args.path, ann.args.value, ann.args.name];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return [c];
    if (Array.isArray(c) && c.length > 0) return c.filter((x) => typeof x === "string");
  }
  return [""];
}

export function getHttpMethodsFromAnnotation(ann: ParsedAnnotation): string[] {
  if (HTTP_METHOD_BY_ANNOTATION[ann.name]) {
    return HTTP_METHOD_BY_ANNOTATION[ann.name];
  }
  if (ann.name === "RequestMapping") {
    const method = ann.args.method;
    if (typeof method === "string" && method) {
      return method
        .split(/[,|]/)
        .map((m) => m.replace(/RequestMethod\./g, "").trim().toUpperCase())
        .filter(Boolean);
    }
    if (Array.isArray(method) && method.length > 0) {
      return method.map((m) =>
        String(m).replace(/RequestMethod\./g, "").trim().toUpperCase(),
      );
    }
    return ["GET"];
  }
  return [];
}

export function isMappingAnnotation(name: string): boolean {
  return MAPPING_ANNOTATIONS.has(name);
}

export function parseJavaControllers(
  source: string,
  sourceFile: string,
): ParsedControllerClass[] {
  // Fast bail-out for non-controller files
  if (!source.includes("@RestController") && !source.includes("@Controller")) {
    return [];
  }

  const cleaned = stripJavaComments(source);
  const controllers: ParsedControllerClass[] = [];
  const packageName = source.match(/package\s+([\w.]+)\s*;/)?.[1];

  const classRe =
    /(?:public\s+|protected\s+|private\s+)?(?:abstract\s+|final\s+)?class\s+(\w+)\b[^{]*\{/g;

  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRe.exec(cleaned)) !== null) {
    const className = classMatch[1];
    const classKeywordIndex = classMatch.index;

    // Look backward for annotation block (skip whitespace only)
    const annStart = findAnnotationBlockStart(cleaned, classKeywordIndex);
    const annotations = scanAnnotations(cleaned, annStart, classKeywordIndex);

    const hasRest = annotations.some((a) => a.name === "RestController");
    const hasController = annotations.some((a) => a.name === "Controller");
    const hasResponseBody = annotations.some((a) => a.name === "ResponseBody");

    if (!hasRest && !hasController) continue;

    const classBodyStart = classMatch.index + classMatch[0].length - 1;
    const classBodyEnd = findMatchingBrace(cleaned, classBodyStart);
    if (classBodyEnd < 0) continue;

    const body = cleaned.slice(classBodyStart + 1, classBodyEnd);
    const methods = parseControllerMethods(body, classBodyStart + 1, source);

    // Include all mapped methods on @Controller / @RestController.
    // Spring MVC form controllers (@ModelAttribute + String view returns) are
    // still useful as Fishman requests.
    controllers.push({
      name: className,
      annotations,
      methods,
      isRestController: hasRest || hasResponseBody,
      sourceFile,
      packageName,
    });
  }

  return controllers;
}

function findAnnotationBlockStart(source: string, classIndex: number): number {
  let i = classIndex - 1;
  while (i >= 0 && /\s/.test(source[i])) i--;

  // Walk backward over annotation cluster
  while (i >= 0) {
    // Skip trailing whitespace of previous annotation
    while (i >= 0 && /\s/.test(source[i])) i--;
    if (i < 0) break;

    // End of annotation args ')'
    if (source[i] === ")") {
      const open = findMatchingParenBackward(source, i);
      if (open < 0) break;
      i = open - 1;
      while (i >= 0 && /\s/.test(source[i])) i--;
      // annotation name
      while (i >= 0 && /[\w.]/.test(source[i])) i--;
      if (i >= 0 && source[i] === "@") {
        // continue to previous annotation
        i--;
        continue;
      }
      break;
    }

    // Annotation without args: @RestController
    if (/[\w.]/.test(source[i])) {
      while (i >= 0 && /[\w.]/.test(source[i])) i--;
      if (i >= 0 && source[i] === "@") {
        i--;
        continue;
      }
    }
    break;
  }

  let start = i + 1;
  while (start < classIndex && /\s/.test(source[start])) start++;
  return start;
}

function parseControllerMethods(
  body: string,
  bodyAbsoluteOffset: number,
  originalSource: string,
): ParsedControllerMethod[] {
  const methods: ParsedControllerMethod[] = [];

  // Simple method signature — no nested annotation regex
  const methodRe =
    /(?:public|protected|private)\s+(?:static\s+)?([\w.<>,?[\]\s]+?)\s+(\w+)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = methodRe.exec(body)) !== null) {
    const returnType = match[1].trim();
    const name = match[2];
    if (name === "if" || name === "for" || name === "while" || name === "switch") continue;

    const parenOpen = match.index + match[0].length - 1;
    const parenClose = findMatchingParen(body, parenOpen);
    if (parenClose < 0) continue;

    let after = parenClose + 1;
    while (after < body.length && /\s/.test(body[after])) after++;
    // optional throws
    if (body.slice(after, after + 6) === "throws") {
      const brace = body.indexOf("{", after);
      if (brace < 0) continue;
      after = brace;
    }
    if (body[after] !== "{") continue;

    // Annotations immediately preceding the method modifiers
    const annStart = findAnnotationBlockStart(body, match.index);
    const annotations = scanAnnotations(body, annStart, match.index);
    if (!annotations.some((a) => isMappingAnnotation(a.name))) continue;

    const paramsRaw = body.slice(parenOpen + 1, parenClose);
    const absoluteStart = bodyAbsoluteOffset + annStart;

    methods.push({
      annotations,
      name,
      returnType,
      params: parseMethodParams(paramsRaw),
      startIndex: absoluteStart,
      lineNumber: lineNumberAt(originalSource, absoluteStart),
    });
  }

  return methods;
}

export function parseMethodParams(paramsRaw: string): ParsedMethodParam[] {
  const params: ParsedMethodParam[] = [];
  if (!paramsRaw.trim()) return params;

  for (const part of splitTopLevelParams(paramsRaw)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const annotations = scanAnnotations(trimmed, 0, trimmed.length);
    let withoutAnn = trimmed;
    // Remove annotation prefixes iteratively
    for (const ann of annotations) {
      withoutAnn = withoutAnn.replace(ann.raw, " ");
    }
    withoutAnn = withoutAnn.replace(/@[\w.]+/g, " ").trim();

    const tokens = withoutAnn.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    let isVarargs = false;
    let type: string;
    let name: string;

    if (tokens.length === 1) {
      type = "Object";
      name = tokens[0].replace(/^\.\.\./, "");
    } else {
      name = tokens[tokens.length - 1].replace(/,$/, "");
      type = tokens.slice(0, -1).join(" ");
      if (type.endsWith("...")) {
        isVarargs = true;
        type = type.slice(0, -3).trim();
      }
      if (name.startsWith("...")) {
        isVarargs = true;
        name = name.slice(3);
      }
    }

    params.push({ annotations, type, name, isVarargs });
  }

  return params;
}

function splitTopLevelParams(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      current += ch;
      if (ch === "\\" && i + 1 < input.length) {
        current += input[++i];
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === "<" || ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ">" || ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\" && i + 1 < source.length) {
        i++;
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingParenBackward(source: string, closeIndex: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = closeIndex; i >= 0; i--) {
    const ch = source[i];
    if (inString) {
      // crude backward string handling
      if (ch === stringChar && (i === 0 || source[i - 1] !== "\\")) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === ")") depth++;
    else if (ch === "(") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === "\\" && i + 1 < source.length) {
        i++;
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  const end = Math.min(index, source.length);
  for (let i = 0; i < end; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

export function annotationHas(
  annotations: ParsedAnnotation[],
  ...names: string[]
): boolean {
  const set = new Set(names);
  return annotations.some((a) => set.has(a.name));
}

export function findAnnotation(
  annotations: ParsedAnnotation[],
  ...names: string[]
): ParsedAnnotation | undefined {
  const set = new Set(names);
  return annotations.find((a) => set.has(a.name));
}
