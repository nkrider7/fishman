import { describe, expect, it } from "vitest";
import type { ApiEndpoint } from "@/scanner/models/endpoint";
import { createEmptyRequest, type RequestDraft } from "@/types/request";
import {
  buildDriftReport,
  buildSyncPlan,
  computeScanKey,
  extractPathFromUrl,
  fingerprintEndpoints,
  mergeEndpointIntoDraft,
  normalizeMethod,
  normalizePath,
  selectSafeSyncIds,
  scanKeyFromDraft,
} from "./index";
import type { CollectionRequestRef } from "./types";

function ep(
  partial: Partial<ApiEndpoint> & Pick<ApiEndpoint, "method" | "path">,
): ApiEndpoint {
  return {
    id: partial.id ?? `${partial.method}:${partial.path}`,
    name: partial.name ?? `${partial.method} ${partial.path}`,
    method: partial.method,
    path: partial.path,
    description: partial.description,
    tags: partial.tags ?? [],
    folder: partial.folder ?? ["General"],
    headers: partial.headers ?? [],
    authentication: partial.authentication,
    queryParameters: partial.queryParameters ?? [],
    pathParameters: partial.pathParameters ?? [],
    requestBody: partial.requestBody,
    responses: partial.responses ?? [],
    middleware: partial.middleware ?? [],
    sourceFile: partial.sourceFile ?? "src/routes.ts",
    controller: partial.controller,
    handler: partial.handler,
    lineNumber: partial.lineNumber,
    framework: partial.framework ?? "express",
    warnings: partial.warnings ?? [],
  };
}

function req(
  draftPartial: Partial<RequestDraft> & Pick<RequestDraft, "method" | "url">,
  id = "r1",
): CollectionRequestRef {
  const draft: RequestDraft = {
    ...createEmptyRequest(),
    id,
    ...draftPartial,
  };
  return { id, collectionId: "root", draft };
}

describe("normalizePath", () => {
  it("adds leading slash and strips trailing slash", () => {
    expect(normalizePath("users")).toBe("/users");
    expect(normalizePath("/users/")).toBe("/users");
    expect(normalizePath("/")).toBe("/");
  });

  it("collapses duplicate slashes", () => {
    expect(normalizePath("//api///v1/users")).toBe("/api/v1/users");
  });

  it("normalizes path params to {name}", () => {
    expect(normalizePath("/users/:id")).toBe("/users/{id}");
    expect(normalizePath("/users/{id}")).toBe("/users/{id}");
    expect(normalizePath("/users/<id>")).toBe("/users/{id}");
    expect(normalizePath("/users/<int:id>")).toBe("/users/{id}");
  });

  it("lowercases param names for stability", () => {
    expect(normalizePath("/users/{Id}")).toBe("/users/{id}");
    expect(normalizePath("/users/:UserId")).toBe("/users/{userid}");
  });
});

describe("extractPathFromUrl", () => {
  it("handles absolute URLs", () => {
    expect(extractPathFromUrl("http://localhost:3000/api/users")).toBe(
      "/api/users",
    );
  });

  it("handles {{baseUrl}} templates", () => {
    expect(extractPathFromUrl("{{baseUrl}}/users")).toBe("/users");
    expect(extractPathFromUrl("{{ base_url }}/v1/items/")).toBe("/v1/items");
  });

  it("strips query strings", () => {
    expect(extractPathFromUrl("/users?page=1")).toBe("/users");
  });
});

describe("computeScanKey", () => {
  it("is method-case independent", () => {
    expect(computeScanKey("get", "/Users/")).toBe("GET:/Users");
    expect(computeScanKey("GET", "/users/:id")).toBe("GET:/users/{id}");
  });
});

describe("fingerprintEndpoints", () => {
  it("is stable regardless of order", () => {
    const a = [ep({ method: "GET", path: "/a" }), ep({ method: "POST", path: "/b" })];
    const b = [ep({ method: "POST", path: "/b" }), ep({ method: "GET", path: "/a" })];
    expect(fingerprintEndpoints(a)).toBe(fingerprintEndpoints(b));
  });
});

describe("buildDriftReport", () => {
  const meta = { language: "node", frameworks: ["express"], durationMs: 10 };

  it("classifies added / removed / unchanged / manual_only", () => {
    const endpoints = [
      ep({ method: "GET", path: "/users" }),
      ep({ method: "POST", path: "/users" }),
    ];
    const requests = [
      req({
        method: "GET",
        url: "http://localhost:3000/users",
        scan: { origin: "scanner", scanKey: "GET:/users" },
      }, "keep"),
      req({
        method: "DELETE",
        url: "{{baseUrl}}/users/{id}",
        scan: { origin: "scanner", scanKey: "DELETE:/users/{id}" },
      }, "gone"),
      req({
        method: "GET",
        url: "{{baseUrl}}/health",
        // no scan meta → manual
      }, "manual"),
    ];

    const report = buildDriftReport({
      collectionRootId: "root",
      projectLabel: "/proj",
      requests,
      endpoints,
      scanResultMeta: meta,
    });

    expect(report.summary.added).toBe(1); // POST /users
    expect(report.summary.removed).toBe(1); // DELETE
    expect(report.summary.unchanged).toBe(1); // GET /users
    expect(report.summary.manualOnly).toBe(1); // health
    expect(report.items.find((i) => i.kind === "added")?.scanKey).toBe(
      "POST:/users",
    );
  });

  it("detects changed body and auth", () => {
    const endpoints = [
      ep({
        method: "POST",
        path: "/login",
        name: "Login",
        authentication: { type: "bearer", required: true },
        requestBody: {
          contentType: "application/json",
          example: '{"email":"a@b.com"}',
        },
      }),
    ];
    const requests = [
      req({
        method: "POST",
        url: "{{baseUrl}}/login",
        name: "Login",
        body: "",
        bodyType: "none",
        auth: { type: "none" },
        scripts: {
          preRequest: "console.log(1)",
          postResponse: "",
          tests: "ok",
        },
        scan: { origin: "scanner", scanKey: "POST:/login" },
      }),
    ];

    const report = buildDriftReport({
      collectionRootId: "root",
      projectLabel: "/proj",
      requests,
      endpoints,
      scanResultMeta: meta,
    });

    expect(report.summary.changed).toBe(1);
    const item = report.items.find((i) => i.kind === "changed")!;
    expect(item.fieldChanges?.some((c) => c.field === "auth")).toBe(true);
    expect(item.fieldChanges?.some((c) => c.field === "body")).toBe(true);
  });

  it("marks locked changed items", () => {
    const endpoints = [
      ep({
        method: "GET",
        path: "/users",
        name: "List users",
        queryParameters: [{ name: "page", in: "query", example: "1" }],
      }),
    ];
    const requests = [
      req({
        method: "GET",
        url: "/users",
        name: "List users",
        params: [],
        scan: {
          origin: "scanner",
          scanKey: "GET:/users",
          userLocked: true,
        },
      }),
    ];
    const report = buildDriftReport({
      collectionRootId: "root",
      projectLabel: "/proj",
      requests,
      endpoints,
      scanResultMeta: meta,
    });
    const changed = report.items.find((i) => i.kind === "changed");
    expect(changed?.locked).toBe(true);
  });

  it("handles empty scan and empty collection", () => {
    const empty = buildDriftReport({
      collectionRootId: "root",
      projectLabel: "/proj",
      requests: [],
      endpoints: [],
      scanResultMeta: meta,
    });
    expect(empty.items).toHaveLength(0);
    expect(empty.summary.added).toBe(0);
  });
});

describe("buildSyncPlan", () => {
  const meta = { language: "node", frameworks: ["express"], durationMs: 1 };

  it("creates/updates/archives and skips locked", () => {
    const endpoints = [
      ep({ method: "GET", path: "/new" }),
      ep({
        method: "GET",
        path: "/old",
        name: "Old v2",
        requestBody: { contentType: "application/json", example: '{"a":1}' },
      }),
      ep({
        method: "GET",
        path: "/locked",
        name: "Locked",
        queryParameters: [{ name: "limit", in: "query", example: "10" }],
      }),
    ];
    const requests = [
      req(
        {
          method: "GET",
          url: "/old",
          name: "Old",
          body: "",
          scripts: { preRequest: "keep-me", postResponse: "", tests: "" },
          scan: { origin: "scanner", scanKey: "GET:/old" },
        },
        "old-id",
      ),
      req(
        {
          method: "DELETE",
          url: "/gone",
          scan: { origin: "scanner", scanKey: "DELETE:/gone" },
        },
        "gone-id",
      ),
      req(
        {
          method: "GET",
          url: "/locked",
          name: "Locked",
          scan: {
            origin: "scanner",
            scanKey: "GET:/locked",
            userLocked: true,
          },
        },
        "locked-id",
      ),
    ];

    const report = buildDriftReport({
      collectionRootId: "root",
      projectLabel: "/proj",
      requests,
      endpoints,
      scanResultMeta: meta,
    });

    const allSyncable = report.items
      .filter((i) => i.kind === "added" || i.kind === "changed" || i.kind === "removed")
      .map((i) => i.id);

    const plan = buildSyncPlan(report, allSyncable);
    expect(plan.actions.some((a) => a.kind === "create")).toBe(true);
    expect(plan.actions.some((a) => a.kind === "update")).toBe(true);
    expect(plan.actions.some((a) => a.kind === "archive")).toBe(true);
    expect(
      plan.actions.find((a) => a.requestId === "locked-id")?.kind,
    ).toBe("skip");

    const update = plan.actions.find((a) => a.kind === "update")!;
    expect(update.draft?.scripts.preRequest).toBe("keep-me");
  });

  it("selectSafeSyncIds excludes removed", () => {
    const report = buildDriftReport({
      collectionRootId: "root",
      projectLabel: "/proj",
      requests: [
        req({
          method: "DELETE",
          url: "/x",
          scan: { origin: "scanner", scanKey: "DELETE:/x" },
        }, "x"),
      ],
      endpoints: [ep({ method: "GET", path: "/y" })],
      scanResultMeta: meta,
    });
    const ids = selectSafeSyncIds(report);
    expect(ids.every((id) => id.startsWith("added:"))).toBe(true);
  });
});

describe("mergeEndpointIntoDraft", () => {
  it("preserves user-added headers and scripts", () => {
    const existing: RequestDraft = {
      ...createEmptyRequest("Login"),
      method: "POST",
      url: "{{baseUrl}}/login",
      headers: [
        { id: "1", key: "X-Custom", value: "1", enabled: true },
        { id: "2", key: "Content-Type", value: "text/plain", enabled: true },
      ],
      scripts: { preRequest: "a", postResponse: "b", tests: "c" },
      scan: { origin: "scanner", scanKey: "POST:/login" },
    };
    const endpoint = ep({
      method: "POST",
      path: "/login",
      name: "Login",
      headers: [{ name: "Content-Type", in: "header", example: "application/json" }],
      requestBody: {
        contentType: "application/json",
        example: '{"ok":true}',
      },
    });
    const merged = mergeEndpointIntoDraft(existing, endpoint, {
      collectionRootId: "r",
      projectLabel: "p",
      scannedAt: 0,
      summary: { added: 0, removed: 0, changed: 0, unchanged: 0, manualOnly: 0 },
      items: [],
      warnings: [],
      scanResultMeta: { language: "node", frameworks: [], durationMs: 0 },
    });
    expect(merged.scripts).toEqual(existing.scripts);
    expect(merged.headers.some((h) => h.key === "X-Custom")).toBe(true);
    expect(merged.url).toBe("{{baseUrl}}/login");
    expect(merged.body).toContain("ok");
  });
});

describe("scanKeyFromDraft", () => {
  it("prefers stamped scanKey", () => {
    const draft = {
      ...createEmptyRequest(),
      method: "GET" as const,
      url: "http://x/y",
      scan: { origin: "scanner" as const, scanKey: "GET:/custom" },
    };
    expect(scanKeyFromDraft(draft)).toBe("GET:/custom");
  });
});

describe("normalizeMethod", () => {
  it("uppercases", () => {
    expect(normalizeMethod("post")).toBe("POST");
  });
});
