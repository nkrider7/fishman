import { describe, expect, it } from "vitest";
import {
  buildImportPreview,
  exportCollectionContent,
  importCollectionContent,
} from "@/import-export/core/service";
import type { CollectionExportData } from "@/import-export/core/types";
import { createEmptyRequest } from "@/types/request";

const POSTMAN_FIXTURE = {
  info: {
    name: "Kitfix",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: [
    {
      name: "Auth",
      item: [
        {
          name: "Login",
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            url: {
              raw: "https://api.example.com/login?ref=app",
              query: [{ key: "ref", value: "app" }],
            },
            body: {
              mode: "raw",
              raw: '{"email":"test@example.com","password":"secret"}',
              options: { raw: { language: "json" } },
            },
            auth: {
              type: "bearer",
              bearer: [{ key: "token", value: "abc", type: "string" }],
            },
          },
        },
      ],
    },
  ],
  variable: [{ key: "baseUrl", value: "https://api.example.com" }],
};

describe("import-export", () => {
  it("detects and previews Postman collections", () => {
    const content = JSON.stringify(POSTMAN_FIXTURE);
    const preview = buildImportPreview(content, "collection.json");

    expect(preview.formatId).toBe("postman");
    expect(preview.collectionName).toBe("Kitfix");
    expect(preview.requestCount).toBe(1);
    expect(preview.folderCount).toBe(1);
    expect(preview.variableCount).toBe(1);
    expect(preview.folderNames).toContain("Auth");
    expect(preview.errors).toHaveLength(0);
  });

  it("imports Postman requests with params, body, and auth", () => {
    const content = JSON.stringify(POSTMAN_FIXTURE);
    const { result } = importCollectionContent(content, "collection.json");

    const login = result.requests.find((r) => r.name === "Login");
    expect(login?.draft.method).toBe("POST");
    expect(login?.draft.params).toHaveLength(1);
    expect(login?.draft.params[0].key).toBe("ref");
    expect(login?.draft.bodyType).toBe("json");
    expect(login?.draft.auth.type).toBe("bearer");
    expect(login?.draft.auth.bearer?.token).toBe("abc");
  });

  it("imports Postman v2.0 auth objects", () => {
    const v2Fixture = {
      info: {
        name: "Legacy",
        schema: "https://schema.getpostman.com/json/collection/v2.0.0/collection.json",
      },
      item: [
        {
          name: "Get User",
          request: {
            method: "GET",
            url: "https://api.example.com/users/1",
            auth: {
              type: "basic",
              basic: {
                username: "user",
                password: "pass",
              },
            },
          },
        },
      ],
    };

    const { result } = importCollectionContent(
      JSON.stringify(v2Fixture),
      "legacy.json",
    );
    const request = result.requests.find((r) => r.name === "Get User");
    expect(request?.draft.auth.type).toBe("basic");
    expect(request?.draft.auth.basic?.username).toBe("user");
    expect(request?.draft.auth.basic?.password).toBe("pass");
  });

  it("round-trips through Fishman native format", () => {
    const draft = createEmptyRequest("Health");
    draft.method = "GET";
    draft.url = "https://api.example.com/health";
    draft.headers = [
      { id: "1", key: "Accept", value: "application/json", enabled: true },
    ];

    const exportData: CollectionExportData = {
      rootFolder: {
        id: "root-1",
        workspace_id: "ws",
        parent_id: null,
        name: "API",
        sort_order: 1,
        created_at: 1,
        updated_at: 1,
      },
      folders: [],
      requests: [
        {
          sort_order: 1,
          collection_id: "root-1",
          draft,
        },
      ],
      variables: [{ id: "v1", key: "host", value: "localhost", enabled: true }],
    };

    const exported = exportCollectionContent("fishman", {
      data: exportData,
      options: { includeVariables: true },
    });

    const preview = buildImportPreview(exported, "api.fishman.json");
    expect(preview.formatId).toBe("fishman");
    expect(preview.requestCount).toBe(1);
    expect(preview.variableCount).toBe(1);

    const { result } = importCollectionContent(exported, "api.fishman.json", "fishman");
    expect(result.requests[0].draft.url).toBe("https://api.example.com/health");
    expect(result.requests[0].draft.headers[0].key).toBe("Accept");
  });

  it("exports Postman v2.1 with headers and body", () => {
    const draft = createEmptyRequest("Create User");
    draft.method = "POST";
    draft.url = "https://api.example.com/users";
    draft.bodyType = "json";
    draft.body = '{"name":"Ada"}';
    draft.headers = [
      { id: "1", key: "Content-Type", value: "application/json", enabled: true },
    ];

    const exported = exportCollectionContent("postman", {
      data: {
        rootFolder: {
          id: "root-2",
          workspace_id: "ws",
          parent_id: null,
          name: "Users API",
          sort_order: 1,
          created_at: 1,
          updated_at: 1,
        },
        folders: [],
        requests: [
          { sort_order: 1, collection_id: "root-2", draft },
        ],
      },
      options: {},
    });

    const parsed = JSON.parse(exported);
    expect(parsed.info.schema).toContain("postman.com");
    expect(parsed.item[0].request.method).toBe("POST");
    expect(parsed.item[0].request.body.raw).toContain("Ada");
    expect(parsed.item[0].request.header).toHaveLength(1);
  });
});
