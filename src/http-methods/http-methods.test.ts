import { describe, expect, it, beforeEach } from "vitest";
import {
  HTTP_METHOD_ORDER,
  METHOD_DEFINITIONS,
  getMethodCssClass,
  getMethodDefinition,
  getMethodWarnings,
  isKnownHttpMethod,
  isSafeMethod,
  matchesMethodSearch,
  methodSupportsBody,
  parseMethodSearch,
  suggestQueryMigration,
  detectQuerySupport,
  clearQueryCapabilityCache,
  shouldOfferQueryFallback,
  applyRequestTemplate,
  QUERY_TEMPLATES,
} from "@/http-methods";
import { createEmptyRequest } from "@/types/request";
import type { ApiResponse } from "@/types/response";

function mockResponse(
  partial: Partial<ApiResponse> & Pick<ApiResponse, "status">,
): ApiResponse {
  return {
    status_text: "OK",
    headers: {},
    body: "",
    size_bytes: 0,
    duration_ms: 10,
    timing: { total_ms: 10, dns_ms: null, connect_ms: null, ttfb_ms: null },
    ...partial,
  };
}

describe("HTTP method registry", () => {
  it("lists methods in the expected selector order", () => {
    expect(HTTP_METHOD_ORDER).toEqual([
      "GET",
      "QUERY",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
      "TRACE",
      "CONNECT",
    ]);
  });

  it("defines QUERY as safe, idempotent, and body-capable", () => {
    const query = METHOD_DEFINITIONS.QUERY;
    expect(query.safe).toBe(true);
    expect(query.idempotent).toBe(true);
    expect(query.supportsBody).toBe(true);
    expect(query.semanticKind).toBe("read");
    expect(query.semanticLabel).toBe("Read Operation");
    expect(query.color).toBe("#06b6d4");
  });

  it("does not treat POST as a read operation", () => {
    expect(METHOD_DEFINITIONS.POST.semanticKind).toBe("mutation");
    expect(METHOD_DEFINITIONS.POST.safe).toBe(false);
  });

  it("exposes helpers without switch statements on callers", () => {
    expect(isKnownHttpMethod("QUERY")).toBe(true);
    expect(isKnownHttpMethod("FOO")).toBe(false);
    expect(isSafeMethod("QUERY")).toBe(true);
    expect(methodSupportsBody("QUERY")).toBe(true);
    expect(methodSupportsBody("GET")).toBe(false);
    expect(getMethodCssClass("QUERY")).toBe("method-query");
    expect(getMethodDefinition("query")?.name).toBe("QUERY");
  });
});

describe("QUERY warnings and migration", () => {
  it("does not warn that QUERY should not have a body", () => {
    const draft = createEmptyRequest();
    draft.method = "QUERY";
    draft.bodyType = "json";
    draft.body = JSON.stringify({ search: "x" });
    draft.headers = [
      {
        id: "1",
        key: "Content-Type",
        value: "application/json",
        enabled: true,
      },
    ];
    const warnings = getMethodWarnings(draft);
    expect(warnings.find((w) => w.id === "body-on-no-body-method")).toBeUndefined();
  });

  it("warns when QUERY has a body without Content-Type", () => {
    const draft = createEmptyRequest();
    draft.method = "QUERY";
    draft.bodyType = "json";
    draft.body = '{"search":"x"}';
    const warnings = getMethodWarnings(draft);
    expect(warnings.some((w) => w.id === "query-missing-content-type")).toBe(
      true,
    );
  });

  it("warns when QUERY body looks like a mutation", () => {
    const draft = createEmptyRequest();
    draft.method = "QUERY";
    draft.bodyType = "json";
    draft.body = JSON.stringify({ action: "delete", id: 1 });
    draft.headers = [
      {
        id: "1",
        key: "Content-Type",
        value: "application/json",
        enabled: true,
      },
    ];
    const warnings = getMethodWarnings(draft);
    expect(warnings.some((w) => w.id === "query-mutation-semantics")).toBe(
      true,
    );
  });

  it("suggests converting read-like POST to QUERY", () => {
    const draft = createEmptyRequest("User search");
    draft.method = "POST";
    draft.bodyType = "json";
    draft.body = JSON.stringify({ search: "narendra", filters: {} });
    expect(suggestQueryMigration(draft)).toMatch(/QUERY/);
  });

  it("applies QUERY templates", () => {
    const draft = createEmptyRequest();
    const template = QUERY_TEMPLATES[0];
    const changes = applyRequestTemplate(draft, template);
    expect(changes.method).toBe("QUERY");
    expect(changes.bodyType).toBe("json");
    expect(changes.body).toContain("search");
  });
});

describe("QUERY capability detection", () => {
  beforeEach(() => {
    clearQueryCapabilityCache();
  });

  it("detects support from Allow header", () => {
    const cap = detectQuerySupport(
      "https://api.example.com/search",
      mockResponse({
        status: 200,
        headers: { Allow: "GET, QUERY, OPTIONS" },
      }),
      "OPTIONS",
    );
    expect(cap?.status).toBe("supported");
    expect(cap?.allowedMethods).toContain("QUERY");
  });

  it("detects support from Accept-Query", () => {
    const cap = detectQuerySupport(
      "https://api.example.com/search",
      mockResponse({
        status: 200,
        headers: { "Accept-Query": "application/json" },
      }),
      "QUERY",
    );
    expect(cap?.status).toBe("supported");
    expect(cap?.acceptQueryMediaTypes).toContain("application/json");
  });

  it("marks 405 QUERY as rejected and offers fallback", () => {
    const response = mockResponse({ status: 405, status_text: "Method Not Allowed" });
    const cap = detectQuerySupport(
      "https://api.example.com/search",
      response,
      "QUERY",
    );
    expect(cap?.status).toBe("rejected");
    expect(shouldOfferQueryFallback("QUERY", response)).toBe(true);
  });

  it("marks successful QUERY as supported", () => {
    const cap = detectQuerySupport(
      "https://api.example.com/search",
      mockResponse({ status: 200 }),
      "QUERY",
    );
    expect(cap?.status).toBe("supported");
  });
});

describe("method search", () => {
  it("parses method:QUERY filters", () => {
    expect(parseMethodSearch("method:QUERY")).toEqual({
      methodFilter: "QUERY",
      textQuery: "",
    });
    expect(parseMethodSearch("method:query users")).toEqual({
      methodFilter: "QUERY",
      textQuery: "users",
    });
  });

  it("matches requests by method filter", () => {
    expect(
      matchesMethodSearch("QUERY", "Search", "https://api/search", "method:QUERY"),
    ).toBe(true);
    expect(
      matchesMethodSearch("POST", "Search", "https://api/search", "method:QUERY"),
    ).toBe(false);
    expect(
      matchesMethodSearch("QUERY", "User Search", "https://api/users", "search"),
    ).toBe(true);
  });
});
