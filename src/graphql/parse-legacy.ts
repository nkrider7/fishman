import {
  createDefaultGraphQLConfig,
  type GraphQLConfig,
} from "./types";
import { serializeGraphQLBody } from "./payload";

/**
 * Hydrate structured GraphQL config from a legacy single-string body
 * (or from an already-synced wire JSON body). Never throws.
 */
export function parseLegacyGraphQLBody(body: string | undefined | null): GraphQLConfig {
  const raw = (body ?? "").trim();
  if (!raw) {
    return createDefaultGraphQLConfig("");
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.query === "string") {
        return {
          query: obj.query,
          variables: formatVariablesForEditor(obj.variables),
          operationName:
            typeof obj.operationName === "string" && obj.operationName.trim()
              ? obj.operationName.trim()
              : null,
          schemaSource: "none",
          transport: "http",
        };
      }
    }
  } catch {
    // Not JSON — treat entire body as a GraphQL document
  }

  return {
    query: raw,
    variables: "{\n  \n}",
    operationName: null,
    schemaSource: "none",
    transport: "http",
  };
}

function formatVariablesForEditor(variables: unknown): string {
  if (variables === undefined || variables === null) {
    return "{\n  \n}";
  }
  if (typeof variables === "string") {
    const trimmed = variables.trim();
    if (!trimmed) return "{\n  \n}";
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return variables;
    }
  }
  try {
    return JSON.stringify(variables, null, 2);
  } catch {
    return "{\n  \n}";
  }
}

/**
 * Ensure a draft has a GraphQL config when bodyType is graphql.
 * Prefers existing `graphql` fields; otherwise parses `body`.
 */
export function ensureGraphQLConfig(input: {
  bodyType: string;
  body: string;
  graphql?: GraphQLConfig;
}): GraphQLConfig | undefined {
  if (input.bodyType !== "graphql") return input.graphql;
  if (input.graphql && typeof input.graphql.query === "string") {
    return {
      query: input.graphql.query,
      variables:
        input.graphql.variables ?? "{\n  \n}",
      operationName: input.graphql.operationName ?? null,
      schemaSource: input.graphql.schemaSource ?? "none",
      transport: input.graphql.transport ?? "http",
    };
  }
  return parseLegacyGraphQLBody(input.body);
}

/** Sync wire `body` string from structured graphql config. */
export function syncGraphQLBody(graphql: GraphQLConfig): string {
  return serializeGraphQLBody(graphql);
}

/**
 * After scripts mutate `body` JSON, re-parse into structured graphql.
 * Prefer body as source of truth for script contract (v1).
 */
export function graphqlFromBodyIfPresent(
  bodyType: string,
  body: string,
  previous?: GraphQLConfig,
): GraphQLConfig | undefined {
  if (bodyType !== "graphql") return previous;
  return parseLegacyGraphQLBody(body);
}
