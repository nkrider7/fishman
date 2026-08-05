import type { ApiRequestBody } from "../../../models/endpoint";

export interface GoSchemaField {
  name: string;
  type: string;
  required: boolean;
}

export interface GoStructSchema {
  name: string;
  fields: GoSchemaField[];
  sourceFile: string;
}

const PRIMITIVE_DEFAULTS: Record<string, unknown> = {
  string: "",
  int: 0,
  int8: 0,
  int16: 0,
  int32: 0,
  int64: 0,
  uint: 0,
  uint8: 0,
  uint16: 0,
  uint32: 0,
  uint64: 0,
  float32: 0,
  float64: 0,
  bool: false,
  byte: 0,
  rune: 0,
  "time.Time": "2024-01-01T00:00:00Z",
  "uuid.UUID": "00000000-0000-0000-0000-000000000000",
};

export function buildStructSchemaIndex(
  files: Array<{ source: string; sourceFile: string }>,
): Map<string, GoStructSchema> {
  const schemas = new Map<string, GoStructSchema>();
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
): GoStructSchema[] {
  const schemas: GoStructSchema[] = [];
  const cleaned = stripGoComments(source);

  // type Name struct { ... }
  const structRe = /type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct\s*\{/g;
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

  return schemas;
}

function parseStructFields(body: string): GoSchemaField[] {
  const fields: GoSchemaField[] = [];

  for (const rawLine of body.split("\n")) {
    let line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    // FieldName Type `tags`  — type may include [], *, map[...], pkg.Type
    const fieldMatch = line.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\s+(.+?)(?:\s+`([^`]*)`)?\s*$/,
    );
    if (!fieldMatch) continue;

    const goName = fieldMatch[1];
    // Skip methods accidentally matched / keywords
    if (["func", "type", "const", "var", "import", "package"].includes(goName)) {
      continue;
    }

    let type = fieldMatch[2].trim();
    // If no tag group but type still contains backticks, split
    if (!fieldMatch[3] && type.includes("`")) {
      const tick = type.indexOf("`");
      type = type.slice(0, tick).trim();
    }
    const tags = fieldMatch[3] ?? "";

    // Embedded struct without field name looks like: `MyType` or `*MyType` only — skip single-token embeds without tags when lowercase? 
    // Embedded: `User` alone — goName would be User and type empty — already need 2 parts.
    if (!type || type.startsWith("`")) continue;

    const jsonTag = parseJsonTag(tags);
    if (jsonTag === "-") continue;

    const name = jsonTag ?? goName;
    // Unexported fields without json tag are usually internal — still include if tagged
    if (!jsonTag && /^[a-z]/.test(goName)) continue;

    const isPointer = type.startsWith("*") || /omitempty/i.test(tags);
    fields.push({
      name,
      type: simplifyGoType(type),
      required: !isPointer && !/omitempty/i.test(tags),
    });
  }

  return fields;
}

function parseJsonTag(tags: string): string | null {
  const match = tags.match(/json:"([^"]*)"/);
  if (!match) return null;
  const value = match[1].split(",")[0].trim();
  if (!value) return null;
  return value;
}

export function simplifyGoType(type: string): string {
  let t = type.trim();
  if (t.startsWith("*")) t = t.slice(1);
  if (t.startsWith("[]")) return `[]${simplifyGoType(t.slice(2))}`;
  // package.Type → Type for defaults lookup, keep dotted for time.Time
  return t;
}

export function findStructSchema(
  schemas: Map<string, GoStructSchema>,
  typeName: string,
): GoStructSchema | undefined {
  const simple = simplifyGoType(typeName).replace(/^\*/, "");
  const bare = simple.includes(".") ? simple.slice(simple.lastIndexOf(".") + 1) : simple;
  return schemas.get(typeName) ?? schemas.get(simple) ?? schemas.get(bare);
}

export function schemaToJsonRequestBody(schema: GoStructSchema): ApiRequestBody {
  const exampleObj: Record<string, unknown> = {};
  for (const field of schema.fields) {
    exampleObj[field.name] = exampleForGoType(field.type);
  }
  return {
    contentType: "application/json",
    schema: exampleObj as Record<string, unknown>,
    example: JSON.stringify(exampleObj, null, 2),
  };
}

export function exampleForGoType(type: string): unknown {
  const simple = simplifyGoType(type);
  if (simple in PRIMITIVE_DEFAULTS) return PRIMITIVE_DEFAULTS[simple];
  if (simple.startsWith("[]")) return [];
  if (simple.startsWith("map[")) return {};
  if (/Id$|Name$|Email$|Title$|Content$|Text$/.test(simple)) return "";
  return null;
}

export function stripGoComments(source: string): string {
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
