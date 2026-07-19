import { buildClientSchema, getIntrospectionQuery, type IntrospectionQuery } from "graphql";
import type { GraphQLDocsModel } from "./types";
import { flattenIntrospectionSchema } from "./docs/flatten";

export const INTROSPECTION_QUERY = getIntrospectionQuery({
  descriptions: true,
  schemaDescription: true,
  inputValueDeprecation: true,
  directiveIsRepeatable: true,
  specifiedByUrl: true,
});

export interface IntrospectionParseResult {
  ok: true;
  schemaJson: IntrospectionQuery;
  docs: GraphQLDocsModel;
  typeCount: number;
}

export interface IntrospectionParseError {
  ok: false;
  error: string;
}

/**
 * Parse a GraphQL HTTP response body from an introspection request.
 * Handles HTTP 200 with `errors` array.
 */
export function parseIntrospectionResponse(
  body: string,
): IntrospectionParseResult | IntrospectionParseError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: "Introspection response is not valid JSON" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Introspection response must be a JSON object" };
  }

  const root = parsed as {
    data?: { __schema?: unknown };
    errors?: Array<{ message?: string }>;
  };

  if (Array.isArray(root.errors) && root.errors.length > 0 && !root.data?.__schema) {
    const msg =
      root.errors.map((e) => e.message).filter(Boolean).join("; ") ||
      "Introspection failed";
    return { ok: false, error: msg };
  }

  const schema = root.data?.__schema;
  if (!schema || typeof schema !== "object") {
    return { ok: false, error: "Introspection response missing data.__schema" };
  }

  const introspection = { __schema: schema } as IntrospectionQuery;

  try {
    // Validate shape via graphql client schema builder
    buildClientSchema(introspection);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid introspection schema",
    };
  }

  const docs = flattenIntrospectionSchema(introspection);
  const typeCount = docs.types.length;

  return {
    ok: true,
    schemaJson: introspection,
    docs,
    typeCount,
  };
}

export function buildIntrospectionRequestBody(): string {
  return JSON.stringify({ query: INTROSPECTION_QUERY });
}
