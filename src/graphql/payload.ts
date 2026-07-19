import type { GraphQLConfig, GraphQLWirePayload } from "./types";

/**
 * Build the HTTP JSON body for a GraphQL request.
 * Empty variables are omitted (Postman-compatible).
 * Empty operationName is omitted.
 */
export function buildGraphQLPayload(
  config: Pick<GraphQLConfig, "query" | "variables" | "operationName">,
): GraphQLWirePayload {
  const payload: GraphQLWirePayload = {
    query: config.query ?? "",
  };

  const variables = parseVariablesObject(config.variables);
  if (variables !== undefined && Object.keys(variables).length > 0) {
    payload.variables = variables;
  }

  const operationName = config.operationName?.trim();
  if (operationName) {
    payload.operationName = operationName;
  }

  return payload;
}

/** Serialize wire payload for storage / HTTP body. */
export function serializeGraphQLBody(
  config: Pick<GraphQLConfig, "query" | "variables" | "operationName">,
): string {
  return JSON.stringify(buildGraphQLPayload(config), null, 2);
}

/**
 * Parse variables editor text into an object.
 * Returns `undefined` for blank/whitespace-only input.
 * Throws SyntaxError for invalid JSON (caller validates before send).
 */
export function parseVariablesObject(
  variablesText: string | undefined | null,
): Record<string, unknown> | undefined {
  const trimmed = (variablesText ?? "").trim();
  if (!trimmed) return undefined;

  const parsed: unknown = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyntaxError("Variables must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Soft parse — returns null on failure instead of throwing. */
export function tryParseVariablesObject(
  variablesText: string | undefined | null,
): { ok: true; value: Record<string, unknown> | undefined } | { ok: false; error: string } {
  try {
    return { ok: true, value: parseVariablesObject(variablesText) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Variables must be valid JSON",
    };
  }
}
