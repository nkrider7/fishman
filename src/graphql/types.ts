/**
 * GraphQL request domain types.
 * Transport is HTTP today; `ws` reserved for future subscriptions.
 */
export type GraphQLTransport = "http" | "ws";

export type GraphQLSchemaSource = "introspection" | "sdl" | "none";

export interface GraphQLConfig {
  query: string;
  /** JSON text for the variables editor (not a parsed object). */
  variables: string;
  operationName: string | null;
  schemaSource?: GraphQLSchemaSource;
  /** Future: "ws" for subscriptions. */
  transport?: GraphQLTransport;
}

export interface GraphQLWirePayload {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

export interface GraphQLValidationIssue {
  field: "query" | "variables" | "operationName";
  message: string;
}

export interface GraphQLDocTypeRef {
  kind: string;
  name: string | null;
  ofType: GraphQLDocTypeRef | null;
}

export interface GraphQLDocArg {
  name: string;
  description: string | null;
  type: GraphQLDocTypeRef;
  defaultValue: string | null;
}

export interface GraphQLDocField {
  name: string;
  description: string | null;
  args: GraphQLDocArg[];
  type: GraphQLDocTypeRef;
  isDeprecated?: boolean;
  deprecationReason?: string | null;
}

export interface GraphQLDocType {
  kind: string;
  name: string;
  description: string | null;
  fields: GraphQLDocField[];
  enumValues?: Array<{ name: string; description: string | null }>;
  inputFields?: GraphQLDocArg[];
}

export interface GraphQLDocsModel {
  queries: GraphQLDocField[];
  mutations: GraphQLDocField[];
  subscriptions: GraphQLDocField[];
  types: GraphQLDocType[];
  queryTypeName: string | null;
  mutationTypeName: string | null;
  subscriptionTypeName: string | null;
}

export interface GraphQLSchemaCacheEntry {
  endpoint: string;
  fetchedAt: number;
  typeCount: number;
  docs: GraphQLDocsModel;
  /** Introspection `__schema` JSON for completions / validation. */
  schemaJson: unknown;
}

export const DEFAULT_GRAPHQL_QUERY = `query Example {
  __typename
}
`;

export const EMPTY_GRAPHQL_CONFIG: GraphQLConfig = {
  query: "",
  variables: "{\n  \n}",
  operationName: null,
  schemaSource: "none",
  transport: "http",
};

export function createDefaultGraphQLConfig(
  query = DEFAULT_GRAPHQL_QUERY,
): GraphQLConfig {
  return {
    ...EMPTY_GRAPHQL_CONFIG,
    query,
  };
}
