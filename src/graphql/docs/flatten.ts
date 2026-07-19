import type { IntrospectionQuery } from "graphql";
import type {
  GraphQLDocArg,
  GraphQLDocField,
  GraphQLDocType,
  GraphQLDocTypeRef,
  GraphQLDocsModel,
} from "../types";

/** Loose introspection type node (union fields vary by kind). */
interface IntroTypeNode {
  kind: string;
  name?: string | null;
  description?: string | null;
  fields?: IntroFieldNode[] | null;
  inputFields?: IntroInputValue[] | null;
  enumValues?: Array<{
    name: string;
    description?: string | null;
  }> | null;
  ofType?: IntroTypeNode | null;
}

interface IntroInputValue {
  name: string;
  description?: string | null;
  type: IntroTypeNode;
  defaultValue?: string | null;
}

interface IntroFieldNode {
  name: string;
  description?: string | null;
  args?: IntroInputValue[] | null;
  type: IntroTypeNode;
  isDeprecated?: boolean;
  deprecationReason?: string | null;
}

function mapTypeRef(t: IntroTypeNode | null | undefined): GraphQLDocTypeRef {
  if (!t) {
    return { kind: "SCALAR", name: null, ofType: null };
  }
  return {
    kind: String(t.kind),
    name: t.name ?? null,
    ofType: t.ofType ? mapTypeRef(t.ofType) : null,
  };
}

function mapArgs(args: IntroInputValue[] | null | undefined): GraphQLDocArg[] {
  if (!args) return [];
  return args.map((a) => ({
    name: a.name,
    description: a.description ?? null,
    type: mapTypeRef(a.type),
    defaultValue: a.defaultValue ?? null,
  }));
}

function mapFields(
  fields: IntroFieldNode[] | null | undefined,
): GraphQLDocField[] {
  if (!fields) return [];
  return fields.map((f) => ({
    name: f.name,
    description: f.description ?? null,
    args: mapArgs(f.args),
    type: mapTypeRef(f.type),
    isDeprecated: f.isDeprecated,
    deprecationReason: f.deprecationReason ?? null,
  }));
}

function findType(
  types: ReadonlyArray<IntroTypeNode>,
  name: string | null | undefined,
): IntroTypeNode | undefined {
  if (!name) return undefined;
  return types.find((t) => t.name === name);
}

export function flattenIntrospectionSchema(
  introspection: IntrospectionQuery,
): GraphQLDocsModel {
  const schema = introspection.__schema;
  const allTypes = (schema.types ?? []) as IntroTypeNode[];
  const types = allTypes.filter(
    (t) => Boolean(t?.name) && !String(t.name).startsWith("__"),
  );

  const queryTypeName = schema.queryType?.name ?? null;
  const mutationTypeName = schema.mutationType?.name ?? null;
  const subscriptionTypeName = schema.subscriptionType?.name ?? null;

  const queryType = findType(allTypes, queryTypeName);
  const mutationType = findType(allTypes, mutationTypeName);
  const subscriptionType = findType(allTypes, subscriptionTypeName);

  const docTypes: GraphQLDocType[] = types.map((t) => ({
    kind: String(t.kind),
    name: t.name!,
    description: t.description ?? null,
    fields: mapFields(t.fields),
    enumValues: t.enumValues?.map((e) => ({
      name: e.name,
      description: e.description ?? null,
    })),
    inputFields: t.inputFields ? mapArgs(t.inputFields) : undefined,
  }));

  return {
    queries: mapFields(queryType?.fields),
    mutations: mapFields(mutationType?.fields),
    subscriptions: mapFields(subscriptionType?.fields),
    types: docTypes,
    queryTypeName,
    mutationTypeName,
    subscriptionTypeName,
  };
}

/** Render a nested type ref as GraphQL SDL-ish string, e.g. `[String!]!`. */
export function formatTypeRef(ref: GraphQLDocTypeRef): string {
  if (ref.kind === "NON_NULL" && ref.ofType) {
    return `${formatTypeRef(ref.ofType)}!`;
  }
  if (ref.kind === "LIST" && ref.ofType) {
    return `[${formatTypeRef(ref.ofType)}]`;
  }
  return ref.name ?? "Unknown";
}

/** Suggest a selection-set snippet when inserting a root field. */
export function fieldInsertSnippet(field: GraphQLDocField): string {
  const args =
    field.args.length > 0
      ? `(${field.args.map((a) => `${a.name}: $${a.name}`).join(", ")})`
      : "";
  const named = unwrapNamedType(field.type);
  const needsSelection =
    named &&
    (named.kind === "OBJECT" ||
      named.kind === "INTERFACE" ||
      named.kind === "UNION");
  if (needsSelection) {
    return `${field.name}${args} {\n  \n}`;
  }
  return `${field.name}${args}`;
}

function unwrapNamedType(ref: GraphQLDocTypeRef): GraphQLDocTypeRef | null {
  let cur: GraphQLDocTypeRef | null = ref;
  while (cur && (cur.kind === "NON_NULL" || cur.kind === "LIST")) {
    cur = cur.ofType;
  }
  return cur;
}
