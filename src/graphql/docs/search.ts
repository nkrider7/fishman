import type { GraphQLDocField, GraphQLDocType, GraphQLDocsModel } from "../types";

export interface GraphQLDocsSearchResult {
  queries: GraphQLDocField[];
  mutations: GraphQLDocField[];
  subscriptions: GraphQLDocField[];
  types: GraphQLDocType[];
}

function matches(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return (haystack ?? "").toLowerCase().includes(needle);
}

/**
 * Case-insensitive substring filter across docs sections.
 */
export function searchGraphQLDocs(
  docs: GraphQLDocsModel,
  query: string,
): GraphQLDocsSearchResult {
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      queries: docs.queries,
      mutations: docs.mutations,
      subscriptions: docs.subscriptions,
      types: docs.types,
    };
  }

  const filterFields = (fields: GraphQLDocField[]) =>
    fields.filter(
      (f) => matches(f.name, q) || matches(f.description, q),
    );

  const filterTypes = (types: GraphQLDocType[]) =>
    types.filter(
      (t) =>
        matches(t.name, q) ||
        matches(t.description, q) ||
        t.fields.some(
          (f) => matches(f.name, q) || matches(f.description, q),
        ),
    );

  return {
    queries: filterFields(docs.queries),
    mutations: filterFields(docs.mutations),
    subscriptions: filterFields(docs.subscriptions),
    types: filterTypes(docs.types),
  };
}
