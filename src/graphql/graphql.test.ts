import { describe, expect, it } from "vitest";
import {
  buildGraphQLPayload,
  serializeGraphQLBody,
  parseLegacyGraphQLBody,
  ensureGraphQLConfig,
  syncGraphQLBody,
  validateGraphQLConfig,
  extractOperationNames,
  parseIntrospectionResponse,
  searchGraphQLDocs,
  flattenIntrospectionSchema,
} from "./index";
import type { IntrospectionQuery } from "graphql";

describe("buildGraphQLPayload", () => {
  it("includes query only when variables empty", () => {
    expect(
      buildGraphQLPayload({
        query: "{ hello }",
        variables: "",
        operationName: null,
      }),
    ).toEqual({ query: "{ hello }" });
  });

  it("omits empty variables object", () => {
    expect(
      buildGraphQLPayload({
        query: "query Q { a }",
        variables: "{}",
        operationName: null,
      }),
    ).toEqual({ query: "query Q { a }" });
  });

  it("includes variables and operationName", () => {
    expect(
      buildGraphQLPayload({
        query: "query GetUser($id: ID!) { user(id: $id) { id } }",
        variables: '{ "id": "1" }',
        operationName: "GetUser",
      }),
    ).toEqual({
      query: "query GetUser($id: ID!) { user(id: $id) { id } }",
      variables: { id: "1" },
      operationName: "GetUser",
    });
  });

  it("serializes pretty JSON body", () => {
    const body = serializeGraphQLBody({
      query: "{ ping }",
      variables: "",
      operationName: null,
    });
    expect(JSON.parse(body)).toEqual({ query: "{ ping }" });
  });
});

describe("parseLegacyGraphQLBody", () => {
  it("parses wire JSON", () => {
    const cfg = parseLegacyGraphQLBody(
      JSON.stringify({
        query: "query A { __typename }",
        variables: { x: 1 },
        operationName: "A",
      }),
    );
    expect(cfg.query).toContain("__typename");
    expect(JSON.parse(cfg.variables)).toEqual({ x: 1 });
    expect(cfg.operationName).toBe("A");
  });

  it("treats raw document as query", () => {
    const cfg = parseLegacyGraphQLBody("query { viewer { id } }");
    expect(cfg.query).toBe("query { viewer { id } }");
    expect(cfg.operationName).toBeNull();
  });

  it("round-trips via syncGraphQLBody", () => {
    const original = {
      query: "query X { a }",
      variables: '{\n  "n": 2\n}',
      operationName: "X",
      schemaSource: "none" as const,
      transport: "http" as const,
    };
    const body = syncGraphQLBody(original);
    const back = parseLegacyGraphQLBody(body);
    expect(back.query).toBe(original.query);
    expect(back.operationName).toBe("X");
    expect(JSON.parse(back.variables)).toEqual({ n: 2 });
  });
});

describe("ensureGraphQLConfig", () => {
  it("prefers existing graphql field", () => {
    const cfg = ensureGraphQLConfig({
      bodyType: "graphql",
      body: "{}",
      graphql: {
        query: "query Keep { a }",
        variables: "{}",
        operationName: null,
      },
    });
    expect(cfg?.query).toBe("query Keep { a }");
  });

  it("parses body when graphql missing", () => {
    const cfg = ensureGraphQLConfig({
      bodyType: "graphql",
      body: JSON.stringify({ query: "{ b }" }),
    });
    expect(cfg?.query).toBe("{ b }");
  });
});

describe("validateGraphQLConfig", () => {
  it("rejects invalid variables JSON", () => {
    const issues = validateGraphQLConfig({
      query: "{ a }",
      variables: "{",
      operationName: null,
    });
    expect(issues.some((i) => i.field === "variables")).toBe(true);
  });

  it("accepts valid query", () => {
    const issues = validateGraphQLConfig({
      query: "query { __typename }",
      variables: "{}",
      operationName: null,
    });
    expect(issues).toEqual([]);
  });
});

describe("extractOperationNames", () => {
  it("lists named operations", () => {
    expect(
      extractOperationNames(`
        query One { a }
        mutation Two { b }
      `),
    ).toEqual(["One", "Two"]);
  });
});

describe("introspection parse", () => {
  const miniSchema = {
    __schema: {
      queryType: { name: "Query" },
      mutationType: null,
      subscriptionType: null,
      types: [
        {
          kind: "OBJECT",
          name: "Query",
          description: null,
          fields: [
            {
              name: "hello",
              description: "Says hello",
              args: [],
              type: { kind: "SCALAR", name: "String", ofType: null },
              isDeprecated: false,
              deprecationReason: null,
            },
          ],
          inputFields: null,
          interfaces: [],
          enumValues: null,
          possibleTypes: null,
        },
        {
          kind: "SCALAR",
          name: "String",
          description: null,
          fields: null,
          inputFields: null,
          interfaces: null,
          enumValues: null,
          possibleTypes: null,
        },
      ],
      directives: [],
    },
  } as unknown as IntrospectionQuery;

  it("parses successful introspection JSON", () => {
    const result = parseIntrospectionResponse(
      JSON.stringify({ data: miniSchema }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.docs.queries.some((q) => q.name === "hello")).toBe(true);
      expect(result.typeCount).toBeGreaterThan(0);
    }
  });

  it("surfaces GraphQL errors without schema", () => {
    const result = parseIntrospectionResponse(
      JSON.stringify({ errors: [{ message: "Auth required" }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Auth required");
  });

  it("flattens and searches docs", () => {
    const docs = flattenIntrospectionSchema(miniSchema);
    const found = searchGraphQLDocs(docs, "hel");
    expect(found.queries).toHaveLength(1);
    expect(found.queries[0]?.name).toBe("hello");
  });
});
