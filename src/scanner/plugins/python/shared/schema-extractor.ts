import type { SchemaField, ClassSchema } from "./types";
import type { ParsedPythonModule } from "../../../parsers/ast/python-parser";
import { walkPythonAst } from "../../../parsers/ast/python-parser";
import {
  getAttributeChain,
  getConstantValue,
  getKeywordArg,
  isNodeType,
} from "./ast-utils";
import type { ASTNodeUnion, Call, ClassDef } from "py-ast";
import { exampleForType } from "./example-values";

export function extractSchemasFromModules(
  modules: ParsedPythonModule[],
): Map<string, ClassSchema> {
  const schemas = new Map<string, ClassSchema>();

  for (const mod of modules) {
    walkPythonAst(mod.ast, (node) => {
      if (!isNodeType(node, "ClassDef")) return;
      const cls = node as ClassDef;
      if (!isSchemaClass(cls)) return;

      const fields = extractClassFields(cls);
      if (fields.length === 0) return;

      schemas.set(cls.name, {
        name: cls.name,
        fields,
        sourceFile: mod.filePath,
        baseClasses: cls.bases.map((b) => getAttributeChain(b) ?? "").filter(Boolean),
      });
    });
  }

  return schemas;
}

function isSchemaClass(cls: ClassDef): boolean {
  for (const base of cls.bases) {
    const name = getAttributeChain(base) ?? "";
    if (
      name.includes("BaseModel") ||
      name.includes("Schema") ||
      name.includes("Serializer") ||
      name.includes("ModelSerializer") ||
      name.includes("Form")
    ) {
      return true;
    }
  }
  return false;
}

function extractClassFields(cls: ClassDef): SchemaField[] {
  const fields: SchemaField[] = [];

  for (const stmt of cls.body) {
    if (isNodeType(stmt, "AnnAssign")) {
      const ann = stmt as {
        target: ASTNodeUnion;
        annotation: ASTNodeUnion;
        value?: ASTNodeUnion;
      };
      if (!isNodeType(ann.target, "Name")) continue;
      const name = (ann.target as { id: string }).id;
      if (name.startsWith("_")) continue;

      const typeInfo = parseTypeAnnotation(ann.annotation);
      const fieldMeta = ann.value ? extractFieldMeta(ann.value) : {
        validation: {} as Record<string, unknown>,
      };

      fields.push({
        name,
        type: typeInfo.type,
        required: typeInfo.required && fieldMeta.required !== false,
        defaultValue: fieldMeta.default ?? typeInfo.default,
        validation: fieldMeta.validation,
        description: fieldMeta.description,
      });
    }

    if (isNodeType(stmt, "Assign")) {
      const assign = stmt as { targets: ASTNodeUnion[]; value: ASTNodeUnion };
      for (const target of assign.targets) {
        if (!isNodeType(target, "Name")) continue;
        const name = (target as { id: string }).id;
        const meta = extractFieldMeta(assign.value);
        if (Object.keys(meta.validation).length > 0 || meta.default !== undefined) {
          fields.push({
            name,
            type: "str",
            required: meta.required !== false,
            defaultValue: meta.default,
            validation: meta.validation,
            description: meta.description,
          });
        }
      }
    }
  }

  return fields;
}

function parseTypeAnnotation(node: ASTNodeUnion): {
  type: string;
  required: boolean;
  default?: unknown;
} {
  const chain = getAttributeChain(node);
  if (chain) {
    if (chain.startsWith("Optional") || chain.startsWith("typing.Optional")) {
      const inner = extractGenericArg(node);
      return { type: inner ?? "str", required: false };
    }
    if (chain.startsWith("List") || chain.startsWith("typing.List")) {
      return { type: `List[${extractGenericArg(node) ?? "any"}]`, required: true };
    }
    if (chain.startsWith("Dict") || chain.startsWith("typing.Dict")) {
      return { type: "Dict", required: true };
    }
    if (chain.startsWith("Annotated")) {
      const args = extractGenericArgs(node);
      const baseType = args[0] ? parseTypeAnnotation(args[0]).type : "str";
      return { type: baseType, required: true };
    }
    return { type: simplifyTypeName(chain), required: true };
  }

  if (isNodeType(node, "Subscript")) {
    const sub = node as { value: ASTNodeUnion; slice: ASTNodeUnion };
    const base = getAttributeChain(sub.value) ?? "any";
    if (base === "Optional" || base.endsWith(".Optional")) {
      const inner = isNodeType(sub.slice, "Tuple")
        ? getAttributeChain((sub.slice as { elts: ASTNodeUnion[] }).elts[0]) ?? undefined
        : getAttributeChain(sub.slice) ?? undefined;
      return { type: inner ?? "str", required: false };
    }
    if (base === "Annotated" || base.endsWith(".Annotated")) {
      const elts = isNodeType(sub.slice, "Tuple")
        ? (sub.slice as { elts: ASTNodeUnion[] }).elts
        : [sub.slice];
      const inner = elts[0] ? parseTypeAnnotation(elts[0]).type : "str";
      return { type: inner, required: true };
    }
    if (base === "List" || base.endsWith(".List")) {
      const inner = getAttributeChain(sub.slice) ?? "any";
      return { type: `List[${inner}]`, required: true };
    }
  }

  if (isNodeType(node, "BinOp")) {
    const binop = node as { left: ASTNodeUnion; op: { nodeType?: string; type?: string }; right: ASTNodeUnion };
    const op = binop.op.nodeType ?? binop.op.type;
    if (op === "BitOr") {
      const right = getConstantValue(binop.right);
      if (right === null) {
        const inner = parseTypeAnnotation(binop.left).type;
        return { type: inner, required: false };
      }
    }
  }

  if (isNodeType(node, "Name")) {
    const id = (node as { id: string }).id;
    if (id === "Optional") return { type: "str", required: false };
    return { type: id, required: true };
  }

  return { type: "any", required: true };
}

function extractGenericArg(node: ASTNodeUnion): string | undefined {
  if (isNodeType(node, "Subscript")) {
    const sub = node as { slice: ASTNodeUnion };
    if (isNodeType(sub.slice, "Tuple")) {
      return getAttributeChain((sub.slice as { elts: ASTNodeUnion[] }).elts[0]) ?? undefined;
    }
    return getAttributeChain(sub.slice) ?? undefined;
  }
  return undefined;
}

function extractGenericArgs(node: ASTNodeUnion): ASTNodeUnion[] {
  if (isNodeType(node, "Subscript")) {
    const sub = node as { slice: ASTNodeUnion };
    if (isNodeType(sub.slice, "Tuple")) {
      return (sub.slice as { elts: ASTNodeUnion[] }).elts;
    }
    return [sub.slice];
  }
  return [];
}

function simplifyTypeName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1];
}

function extractFieldMeta(value: ASTNodeUnion): {
  default?: unknown;
  required?: boolean;
  validation: Record<string, unknown>;
  description?: string;
} {
  const validation: Record<string, unknown> = {};
  let defaultValue: unknown;
  let required: boolean | undefined;
  let description: string | undefined;

  if (!isNodeType(value, "Call")) {
    defaultValue = getConstantValue(value);
    return { default: defaultValue, validation };
  }

  const call = value as Call;
  const target = getAttributeChain(call.func) ?? "";

  if (
    target.endsWith("Field") ||
    target.endsWith("Query") ||
    target.endsWith("Path") ||
    target.endsWith("Body") ||
    target.endsWith("Form") ||
    target.endsWith("File")
  ) {
    if (call.args[0]) defaultValue = getConstantValue(call.args[0]);

    for (const kw of call.keywords ?? []) {
      const key = (kw as { arg: string }).arg;
      const val = getConstantValue((kw as { value: ASTNodeUnion }).value);
      if (key === "default") defaultValue = val;
      if (key === "description") description = String(val);
      if (key === "example") validation.example = val;
      if (key && ["min_length", "max_length", "gt", "ge", "lt", "le", "regex"].includes(key)) {
        validation[key] = val;
      }
    }

    if (target.endsWith("Query") || target.endsWith("Path")) {
      const defaultKw = getKeywordArg(call, "default");
      if (defaultKw && isNodeType(defaultKw, "Constant") && (defaultKw as { value: unknown }).value === null) {
        required = false;
      }
    }
  }

  return { default: defaultValue, required, validation, description };
}

export function schemaToExampleBody(schema: ClassSchema): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of schema.fields) {
    body[field.name] = exampleForType(field.type, field.validation);
  }
  return body;
}

export function schemaToRequestBody(
  schema: ClassSchema,
  contentType = "application/json",
): import("../../../models/endpoint").ApiRequestBody {
  const exampleObj = schemaToExampleBody(schema);
  return {
    contentType,
    schema: exampleObj,
    example: JSON.stringify(exampleObj, null, 2),
  };
}

export function findSchemaByName(
  schemas: Map<string, ClassSchema>,
  name: string,
): ClassSchema | undefined {
  if (schemas.has(name)) return schemas.get(name);
  for (const schema of schemas.values()) {
    if (schema.name === name) return schema;
  }
  return undefined;
}

export function extractPathParamsFromPattern(path: string): import("../../../models/endpoint").ApiParameter[] {
  const params: import("../../../models/endpoint").ApiParameter[] = [];
  const patterns = [
    /\{([^}:]+)(?::([^}]+))?\}/g,
    /<(?:([^:>]+):)?([^>]+)>/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(path)) !== null) {
      const name = match[2] ?? match[1];
      const type = match[2] && match[1] ? match[1] : "str";
      if (!params.some((p) => p.name === name)) {
        params.push({
          name,
          type: normalizeParamType(type),
          required: true,
          in: "path",
          example: String(exampleForType(normalizeParamType(type))),
        });
      }
    }
  }
  return params;
}

function normalizeParamType(t: string): string {
  const map: Record<string, string> = {
    int: "int",
    integer: "int",
    str: "str",
    string: "str",
    uuid: "UUID",
    float: "float",
    bool: "bool",
    path: "str",
  };
  return map[t.toLowerCase()] ?? t;
}
