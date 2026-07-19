import { parse, Kind, type DocumentNode, type OperationDefinitionNode } from "graphql";
import type { GraphQLConfig, GraphQLValidationIssue } from "./types";
import { tryParseVariablesObject } from "./payload";

export function validateGraphQLConfig(
  config: GraphQLConfig,
  options?: { requireQuery?: boolean },
): GraphQLValidationIssue[] {
  const issues: GraphQLValidationIssue[] = [];
  const requireQuery = options?.requireQuery ?? true;
  const query = config.query?.trim() ?? "";

  if (requireQuery && !query) {
    issues.push({ field: "query", message: "GraphQL query is required" });
  } else if (query) {
    try {
      parse(query);
    } catch (e) {
      issues.push({
        field: "query",
        message: e instanceof Error ? e.message : "Invalid GraphQL query",
      });
    }
  }

  const vars = tryParseVariablesObject(config.variables);
  if (!vars.ok) {
    issues.push({ field: "variables", message: vars.error });
  }

  const opName = config.operationName?.trim();
  if (opName && query) {
    try {
      const doc = parse(query);
      const names = listOperationNames(doc);
      if (names.length > 0 && !names.includes(opName)) {
        issues.push({
          field: "operationName",
          message: `Operation "${opName}" not found in document`,
        });
      }
    } catch {
      // query parse error already reported
    }
  }

  return issues;
}

export function listOperationNames(doc: DocumentNode): string[] {
  const names: string[] = [];
  for (const def of doc.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) {
      const op = def as OperationDefinitionNode;
      if (op.name?.value) names.push(op.name.value);
    }
  }
  return names;
}

/** Extract named operations from a query string. Never throws. */
export function extractOperationNames(query: string): string[] {
  try {
    return listOperationNames(parse(query));
  } catch {
    return [];
  }
}

export function validateGraphQLForSend(
  config: GraphQLConfig | undefined,
): string | null {
  if (!config) return "GraphQL configuration is missing";
  const issues = validateGraphQLConfig(config, { requireQuery: true });
  return issues[0]?.message ?? null;
}
