import type { ApiRequestBody } from "../../../models/endpoint";

export interface RustSchemaField {
  name: string;
  type: string;
  required: boolean;
}

export interface RustStructSchema {
  name: string;
  fields: RustSchemaField[];
  sourceFile: string;
}

const PRIMITIVE_DEFAULTS: Record<string, unknown> = {
  String: "",
  str: "",
  i8: 0,
  i16: 0,
  i32: 0,
  i64: 0,
  i128: 0,
  isize: 0,
  u8: 0,
  u16: 0,
  u32: 0,
  u64: 0,
  u128: 0,
  usize: 0,
  f32: 0,
  f64: 0,
  bool: false,
  Uuid: "00000000-0000-0000-0000-000000000000",
  DateTime: "2024-01-01T00:00:00Z",
  NaiveDate: "2024-01-01",
  NaiveDateTime: "2024-01-01T00:00:00",
};

/** Index all `struct Name { ... }` definitions across project sources. */
export function buildStructSchemaIndex(
  files: Array<{ source: string; sourceFile: string }>,
): Map<string, RustStructSchema> {
  const schemas = new Map<string, RustStructSchema>();
  for (const file of files) {
    for (const schema of extractStructsFromSource(file.source, file.sourceFile)) {
      schemas.set(schema.name, schema);
    }
  }
  return schemas;
}

export function extractStructsFromSource(
  source: string,
  sourceFile: string,
): RustStructSchema[] {
  const schemas: RustStructSchema[] = [];
  const cleaned = stripRustComments(source);

  // struct Name { fields }
  const structRe =
    /(?:pub(?:\([^)]*\))?\s+)?(?:struct)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = structRe.exec(cleaned)) !== null) {
    const name = match[1];
    const braceStart = match.index + match[0].length - 1;
    const braceEnd = findMatchingBrace(cleaned, braceStart);
    if (braceEnd < 0) continue;
    const body = cleaned.slice(braceStart + 1, braceEnd);
    const fields = parseStructFields(body);
    if (fields.length === 0) continue;
    schemas.push({ name, fields, sourceFile });
  }

  // Tuple structs are skipped; unit structs skipped
  return schemas;
}

function parseStructFields(body: string): RustSchemaField[] {
  const fields: RustSchemaField[] = [];
  for (const rawLine of body.split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    line = line.replace(/,$/, "").trim();
    // Skip nested items
    if (/^(?:pub\s+)?(?:fn|impl|struct|enum|mod|type|const|static)\b/.test(line)) {
      continue;
    }
    // pub title: String  /  title: Option<String>
    const fieldMatch = line.match(
      /^(?:pub(?:\([^)]*\))?\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/,
    );
    if (!fieldMatch) continue;
    const name = fieldMatch[1];
    const type = fieldMatch[2].trim();
    if (name === "self") continue;
    fields.push({
      name,
      type: simplifyRustType(type),
      required: !/\bOption\s*</.test(type),
    });
  }
  return fields;
}

export function simplifyRustType(type: string): string {
  const cleaned = type.replace(/\s+/g, " ").trim();
  const option = cleaned.match(/^Option\s*<\s*(.+)\s*>$/);
  if (option) return simplifyRustType(option[1]);
  const vec = cleaned.match(/^Vec\s*<\s*(.+)\s*>$/);
  if (vec) return `Vec<${simplifyRustType(vec[1])}>`;
  // Strip path prefixes: chrono::DateTime -> DateTime
  const parts = cleaned.replace(/<.*>/, "").split("::");
  const simple = parts[parts.length - 1] || cleaned;
  if (cleaned.includes("<")) {
    const inner = cleaned.match(/<(.+)>/);
    if (inner && /^(?:Vec|HashMap|BTreeMap)/.test(simple)) {
      return `${simple}<${simplifyRustType(inner[1].split(",")[0].trim())}>`;
    }
  }
  return simple;
}

export function findStructSchema(
  schemas: Map<string, RustStructSchema>,
  typeName: string,
): RustStructSchema | undefined {
  const simple = simplifyRustType(typeName);
  return schemas.get(typeName) ?? schemas.get(simple);
}

export function schemaToJsonRequestBody(schema: RustStructSchema): ApiRequestBody {
  const exampleObj: Record<string, unknown> = {};
  for (const field of schema.fields) {
    exampleObj[field.name] = exampleForRustType(field.type);
  }
  return {
    contentType: "application/json",
    schema: exampleObj as Record<string, unknown>,
    example: JSON.stringify(exampleObj, null, 2),
  };
}

export function schemaToFormRequestBody(schema: RustStructSchema): ApiRequestBody {
  const exampleObj: Record<string, unknown> = {};
  const pairs: string[] = [];
  for (const field of schema.fields) {
    const value = exampleForRustType(field.type);
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

export function exampleForRustType(type: string): unknown {
  const simple = simplifyRustType(type);
  if (simple in PRIMITIVE_DEFAULTS) return PRIMITIVE_DEFAULTS[simple];
  if (simple.startsWith("Vec<") || simple.endsWith("[]")) return [];
  if (simple.startsWith("HashMap") || simple.startsWith("BTreeMap")) return {};
  // Common string-like wrappers
  if (/Id$|Name$|Email$|Title$|Content$|Text$/.test(simple)) return "";
  return null;
}

export function stripRustComments(source: string): string {
  // Remove block comments then line comments (naive but good enough for structs)
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
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
