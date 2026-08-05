import { describe, expect, it } from "vitest";
import type { CollectionExportData } from "@/import-export/core/types";
import { createEmptyRequest } from "@/types/request";
import {
  buildDocumentationHtml,
  documentationDefaultFileName,
} from "./build-documentation-html";
import { mapCollectionToOpenCollection } from "./map-collection-to-docs";
import { dumpOpenCollectionYaml } from "./yaml";

function fixture(): CollectionExportData {
  const root = {
    id: "root-1",
    workspace_id: "ws",
    parent_id: null,
    name: "KitBag",
    sort_order: 0,
    created_at: 0,
    updated_at: 0,
    description: "Sample API",
  };
  const folder = {
    id: "folder-admin",
    workspace_id: "ws",
    parent_id: "root-1",
    name: "Admin",
    sort_order: 1,
    created_at: 0,
    updated_at: 0,
  };
  const login = {
    ...createEmptyRequest("Login"),
    id: "req-login",
    method: "POST" as const,
    url: "{{local}}api/auth/login",
    bodyType: "json" as const,
    body: '{\n  "email": "a@b.com",\n  "password": "x"\n}',
    auth: { type: "none" as const },
  };
  const users = {
    ...createEmptyRequest("GetAllUsers"),
    id: "req-users",
    method: "GET" as const,
    url: "{{local}}api/auth/users?page=1&limit=10",
    params: [
      { id: "1", key: "page", value: "1", enabled: true },
      { id: "2", key: "limit", value: "10", enabled: true },
    ],
  };

  return {
    rootFolder: root,
    folders: [root, folder],
    requests: [
      {
        sort_order: 1,
        collection_id: "folder-admin",
        draft: users,
      },
      {
        sort_order: 2,
        collection_id: "root-1",
        draft: login,
      },
    ],
  };
}

describe("documentation generator", () => {
  it("maps folders and requests into OpenCollection items", () => {
    const doc = mapCollectionToOpenCollection(fixture());
    expect(doc.opencollection).toBe("1.0.0");
    expect(doc.info.name).toBe("KitBag");
    expect(doc.items.length).toBe(2);

    const admin = doc.items.find((i) => i.info.type === "folder");
    expect(admin?.info.name).toBe("Admin");
    expect(admin?.items?.some((i) => i.info.name === "GetAllUsers")).toBe(true);

    const login = doc.items.find((i) => i.info.name === "Login");
    expect(login?.http?.method).toBe("POST");
    expect(login?.http?.body?.type).toBe("json");
  });

  it("redacts auth secrets", () => {
    const data = fixture();
    data.requests[1]!.draft.auth = {
      type: "bearer",
      bearer: { token: "super-secret" },
    };
    const doc = mapCollectionToOpenCollection(data);
    const login = doc.items.find((i) => i.info.name === "Login");
    expect(login?.http?.auth).toEqual({ type: "bearer" });
    const yaml = dumpOpenCollectionYaml(doc);
    expect(yaml).not.toContain("super-secret");
  });

  it("builds HTML shell with Bruno CDN and Fishman watermark", () => {
    const html = buildDocumentationHtml(fixture());
    expect(html).toContain("cdn.usebruno.com/docs/docs.css");
    expect(html).toContain("cdn.usebruno.com/docs/docs.js");
    expect(html).toContain("opencollection-container");
    expect(html).toContain("Fishman");
    expect(html).toContain("collectionData");
    expect(html).toContain("playground-runner");
    expect(html.toLowerCase()).not.toContain("super-secret");
  });

  it("sanitizes documentation filenames", () => {
    expect(documentationDefaultFileName("Google Ads APIs")).toBe(
      "Google-Ads-APIs-documentation.html",
    );
  });
});
