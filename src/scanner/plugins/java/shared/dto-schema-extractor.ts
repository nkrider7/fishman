import type { ApiRequestBody } from "../../../models/endpoint";
import type { ClassSchema, SchemaField } from "./types";
import { stripJavaComments } from "./annotation-extractor";

const PRIMITIVE_DEFAULTS: Record<string, unknown> = {
  String: "",
  string: "",
  int: 0,
  Integer: 0,
  long: 0,
  Long: 0,
  double: 0,
  Double: 0,
  float: 0,
  Float: 0,
  boolean: false,
  Boolean: false,
  BigDecimal: 0,
  UUID: "00000000-0000-0000-0000-000000000000",
  LocalDate: "2024-01-01",
  LocalDateTime: "2024-01-01T00:00:00",
  Instant: "2024-01-01T00:00:00Z",
};

export function extractSchemasFromJavaSources(
  files: Array<{ source: string; sourceFile: string }>,
): Map<string, ClassSchema> {
  const schemas = new Map<string, ClassSchema>();
  for (const file of files) {
    for (const schema of extractSchemasFromSource(file.source, file.sourceFile)) {
      schemas.set(schema.name, schema);
      // Also index simple name without package
      const simple = schema.name.includes(".")
        ? schema.name.slice(schema.name.lastIndexOf(".") + 1)
        : schema.name;
      if (!schemas.has(simple)) schemas.set(simple, schema);
    }
  }
  return schemas;
}

export function extractSchemasFromSource(
  source: string,
  sourceFile: string,
): ClassSchema[] {
  const cleaned = stripJavaComments(source);
  const schemas: ClassSchema[] = [];
  const packageName = source.match(/package\s+([\w.]+)\s*;/)?.[1];

  // Records
  const recordRe =
    /(?:public\s+|protected\s+|private\s+)?record\s+(\w+)\s*\(([^)]*)\)\s*(?:implements\s+[^{]+)?\{/g;
  let recordMatch: RegExpExecArray | null;
  while ((recordMatch = recordRe.exec(cleaned)) !== null) {
    const name = recordMatch[1];
    const fields = parseRecordComponents(recordMatch[2]);
    schemas.push({
      name: packageName ? `${packageName}.${name}` : name,
      fields,
      sourceFile,
    });
  }

  // Classes with fields
  const classRe =
    /(?:public\s+|protected\s+|private\s+)?(?:final\s+|abstract\s+)?class\s+(\w+)\s*[^{]*\{/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRe.exec(cleaned)) !== null) {
    const name = classMatch[1];
    const bodyStart = classMatch.index + classMatch[0].length - 1;
    const bodyEnd = findMatchingBrace(cleaned, bodyStart);
    if (bodyEnd < 0) continue;
    const body = cleaned.slice(bodyStart + 1, bodyEnd);
    const fields = parseClassFields(body);
    if (fields.length === 0) continue;
    // Prefer DTO / request / payload / model names; still keep others with fields
    schemas.push({
      name: packageName ? `${packageName}.${name}` : name,
      fields,
      sourceFile,
    });
  }

  return schemas;
}

function parseRecordComponents(raw: string): SchemaField[] {
  const fields: SchemaField[] = [];
  if (!raw.trim()) return fields;
  for (const part of splitTopLevel(raw)) {
    const cleaned = part.replace(/@[\w.]+(?:\s*\([^)]*\))?/g, "").trim();
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;
    const name = tokens[tokens.length - 1];
    const type = tokens.slice(0, -1).join(" ");
    fields.push({
      name,
      type: simpleTypeName(type),
      required: !type.includes("Optional"),
    });
  }
  return fields;
}

function parseClassFields(body: string): SchemaField[] {
  const fields: SchemaField[] = [];
  // private String email;  /  private final int age = 0;
  const fieldRe =
    /(?:private|protected|public)\s+(?:static\s+)?(?:final\s+)?([\w.<>,?[\]\s]+?)\s+(\w+)\s*(?:=|;)/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRe.exec(body)) !== null) {
    const type = match[1].trim();
    const name = match[2];
    if (["class", "interface", "enum", "record"].includes(type)) continue;
    fields.push({
      name,
      type: simpleTypeName(type),
      required: !type.includes("Optional") && !/\bnull\b/.test(match[0]),
    });
  }
  return fields;
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
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

function simpleTypeName(type: string): string {
  const cleaned = type.replace(/\s+/g, " ").trim();
  const noGeneric = cleaned.replace(/<.*>/, "");
  const parts = noGeneric.split(".");
  return parts[parts.length - 1] || cleaned;
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function findSchemaByName(
  schemas: Map<string, ClassSchema>,
  typeName: string,
): ClassSchema | undefined {
  const simple = simpleTypeName(typeName);
  return schemas.get(typeName) ?? schemas.get(simple);
}

const SKIP_BODY_FIELD_TYPES = new Set([
  "List",
  "Set",
  "Map",
  "Collection",
  "Iterable",
  "Optional",
]);

function isCollectionOrRelationType(type: string): boolean {
  const simple = simpleTypeName(type);
  if (SKIP_BODY_FIELD_TYPES.has(simple)) return true;
  if (type.includes("<")) return true;
  if (simple.endsWith("[]")) return true;
  return false;
}

function bodyFields(schema: ClassSchema): SchemaField[] {
  return schema.fields.filter((f) => !isCollectionOrRelationType(f.type));
}

export function schemaToRequestBody(schema: ClassSchema): ApiRequestBody {
  const exampleObj: Record<string, unknown> = {};
  for (const field of bodyFields(schema)) {
    exampleObj[field.name] = exampleForJavaType(field.type);
  }
  return {
    contentType: "application/json",
    schema: exampleObj as Record<string, unknown>,
    example: JSON.stringify(exampleObj, null, 2),
  };
}

/** Spring @ModelAttribute typically binds application/x-www-form-urlencoded. */
export function schemaToFormUrlEncodedBody(schema: ClassSchema): ApiRequestBody {
  const exampleObj: Record<string, unknown> = {};
  const pairs: string[] = [];
  for (const field of bodyFields(schema)) {
    const value = exampleForJavaType(field.type);
    exampleObj[field.name] = value;
    pairs.push(
      `${encodeURIComponent(field.name)}=${encodeURIComponent(value == null ? "" : String(value))}`,
    );
  }
  return {
    contentType: "application/x-www-form-urlencoded",
    schema: exampleObj as Record<string, unknown>,
    example: pairs.join("&"),
  };
}

export function exampleForJavaType(type: string): unknown {
  const simple = simpleTypeName(type);
  if (simple in PRIMITIVE_DEFAULTS) return PRIMITIVE_DEFAULTS[simple];
  if (simple.startsWith("List") || simple.startsWith("Set") || simple.endsWith("[]")) {
    return [];
  }
  if (simple.startsWith("Map")) return {};
  return null;
}

export function emptyJsonBody(warning?: string): {
  body: ApiRequestBody;
  warnings: string[];
} {
  return {
    body: {
      contentType: "application/json",
      schema: {},
      example: "{}",
    },
    warnings: warning ? [warning] : [],
  };
}
