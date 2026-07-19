import type { BodyType, RequestDraft } from "@/types/request";

export interface RequestTemplate {
  id: string;
  name: string;
  description: string;
  method: "QUERY";
  bodyType: BodyType;
  body: string;
  /** Suggested Content-Type header value */
  contentType?: string;
  tags: string[];
}

/** Built-in QUERY examples for search, filtering, analytics, and GraphQL-over-QUERY. */
export const QUERY_TEMPLATES: RequestTemplate[] = [
  {
    id: "query-json-search",
    name: "JSON Search",
    description: "Simple paginated search payload.",
    method: "QUERY",
    bodyType: "json",
    contentType: "application/json",
    tags: ["search", "pagination"],
    body: JSON.stringify(
      {
        search: "Fishman",
        page: 1,
        limit: 20,
      },
      null,
      2,
    ),
  },
  {
    id: "query-advanced-filter",
    name: "Advanced Filter",
    description: "Structured filters, sort, and includes.",
    method: "QUERY",
    bodyType: "json",
    contentType: "application/json",
    tags: ["filter", "sort"],
    body: JSON.stringify(
      {
        filters: {
          category: "API",
          status: "active",
        },
        sort: ["updatedAt"],
        include: ["owner"],
      },
      null,
      2,
    ),
  },
  {
    id: "query-analytics",
    name: "Analytics Aggregation",
    description: "Time-range analytics query with group-by.",
    method: "QUERY",
    bodyType: "json",
    contentType: "application/json",
    tags: ["analytics"],
    body: JSON.stringify(
      {
        metric: "request_count",
        range: { from: "2026-01-01", to: "2026-07-01" },
        groupBy: ["method", "status"],
        interval: "1d",
      },
      null,
      2,
    ),
  },
  {
    id: "query-elasticsearch",
    name: "Elasticsearch-style",
    description: "Query DSL inspired search body.",
    method: "QUERY",
    bodyType: "json",
    contentType: "application/json",
    tags: ["elasticsearch", "search"],
    body: JSON.stringify(
      {
        query: {
          bool: {
            must: [{ match: { title: "api client" } }],
            filter: [{ term: { status: "published" } }],
          },
        },
        from: 0,
        size: 25,
        sort: [{ updated_at: "desc" }],
      },
      null,
      2,
    ),
  },
  {
    id: "query-graphql",
    name: "GraphQL over QUERY",
    description:
      "GraphQL document sent with HTTP QUERY (not the same as GraphQL's query operation).",
    method: "QUERY",
    bodyType: "graphql",
    contentType: "application/json",
    tags: ["graphql"],
    body: JSON.stringify(
      {
        query: `query SearchUsers($q: String!) {
  users(search: $q) {
    id
    name
    email
  }
}`,
        variables: { q: "fishman" },
      },
      null,
      2,
    ),
  },
];

export function applyRequestTemplate(
  draft: RequestDraft,
  template: RequestTemplate,
): Partial<RequestDraft> {
  const headers = [...draft.headers];
  if (template.contentType) {
    const idx = headers.findIndex(
      (h) => h.key.toLowerCase() === "content-type",
    );
    if (idx >= 0) {
      headers[idx] = {
        ...headers[idx],
        value: template.contentType,
        enabled: true,
      };
    } else {
      headers.push({
        id: crypto.randomUUID(),
        key: "Content-Type",
        value: template.contentType,
        enabled: true,
      });
    }
  }

  return {
    method: template.method,
    bodyType: template.bodyType,
    body: template.body,
    headers,
  };
}
