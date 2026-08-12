import { describe, expect, it } from "vitest";
import { buildUrlReplaceMatches, collectDescendantFolderIds } from "./build-plan";
import { DEFAULT_URL_REPLACE_OPTIONS } from "./types";
import type { CollectionFolder, SavedRequest } from "@/types/collection";
import type { Environment } from "@/types/environment";

function folder(
  partial: Partial<CollectionFolder> & Pick<CollectionFolder, "id" | "name">,
): CollectionFolder {
  return {
    workspace_id: "ws",
    parent_id: null,
    sort_order: 0,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

function request(
  partial: Partial<SavedRequest> & Pick<SavedRequest, "id" | "name" | "url">,
): SavedRequest {
  return {
    collection_id: "col1",
    method: "GET",
    headers_json: "[]",
    params_json: "[]",
    body_type: "none",
    body_json: "",
    auth_type: "none",
    auth_json: "{}",
    is_favorite: 0,
    sort_order: 0,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

const baseOpts = {
  ...DEFAULT_URL_REPLACE_OPTIONS,
  includeOpenTabs: false,
  includeEnvironmentVariables: false,
  includeFolderBaseUrl: false,
};

describe("collectDescendantFolderIds", () => {
  it("includes nested folders", () => {
    const folders = [
      folder({ id: "root", name: "Root" }),
      folder({ id: "a", name: "A", parent_id: "root" }),
      folder({ id: "b", name: "B", parent_id: "a" }),
      folder({ id: "other", name: "Other" }),
    ];
    expect([...collectDescendantFolderIds("root", folders)].sort()).toEqual([
      "a",
      "b",
      "root",
    ]);
  });
});

describe("buildUrlReplaceMatches", () => {
  const folders = [
    folder({ id: "col1", name: "API" }),
    folder({
      id: "folder1",
      name: "Users",
      parent_id: "col1",
      presets_json: JSON.stringify({ baseUrl: "http://localhost:3000" }),
    }),
  ];
  const requests = [
    request({
      id: "r1",
      name: "List",
      url: "http://localhost:3000/api/users",
      collection_id: "folder1",
    }),
    request({
      id: "r2",
      name: "Other port",
      url: "http://localhost:30000/api/users",
      collection_id: "folder1",
    }),
    request({
      id: "r3",
      name: "Templated",
      url: "{{base_url}}/api/users",
      collection_id: "folder1",
    }),
    request({
      id: "r4",
      name: "With body",
      url: "http://example.com/x",
      collection_id: "folder1",
      body_type: "json",
      body_json: '{\n  "authname": "demo"\n}',
      params_json: JSON.stringify([
        { id: "p1", key: "authname", value: "q", enabled: true },
      ]),
    }),
  ];
  const environments: Environment[] = [
    {
      id: "e1",
      workspace_id: "ws",
      collection_id: null,
      name: "Local",
      variables: [
        {
          id: "v1",
          key: "base_url",
          value: "http://localhost:3000",
          enabled: true,
        },
      ],
      sort_order: 0,
      created_at: 0,
      updated_at: 0,
    },
  ];

  it("matches URLs in origin mode and skips unsafe ports/templates", () => {
    const matches = buildUrlReplaceMatches(
      "http://localhost:3000",
      "http://localhost:4000",
      { kind: "collection", folderId: "col1" },
      {
        ...baseOpts,
        wholeOrigin: true,
        includeUrl: true,
        includeBody: false,
        includeParams: false,
      },
      {
        folders,
        requests,
        environments,
        openDrafts: {},
        tabs: [],
      },
    );
    expect(matches.some((m) => m.field === "url" && m.targetId === "r1")).toBe(
      true,
    );
    expect(matches.some((m) => m.targetId === "r2")).toBe(false);
    expect(matches.some((m) => m.targetId === "r3")).toBe(false);
  });

  it("finds body and param text separately", () => {
    const matches = buildUrlReplaceMatches(
      "authname",
      "username",
      { kind: "collection", folderId: "col1" },
      {
        ...baseOpts,
        wholeOrigin: false,
        includeUrl: false,
        includeBody: true,
        includeParams: true,
      },
      { folders, requests, environments, openDrafts: {}, tabs: [] },
    );
    expect(matches.some((m) => m.field === "body")).toBe(true);
    expect(matches.some((m) => m.field === "param" && m.paramPart === "key")).toBe(
      true,
    );
  });

  it("includes folder baseUrl when enabled", () => {
    const matches = buildUrlReplaceMatches(
      "http://localhost:3000",
      "http://localhost:4000",
      { kind: "collection", folderId: "col1" },
      {
        ...baseOpts,
        wholeOrigin: true,
        includeUrl: false,
        includeBody: false,
        includeParams: false,
        includeFolderBaseUrl: true,
      },
      { folders, requests, environments, openDrafts: {}, tabs: [] },
    );
    expect(matches.some((m) => m.kind === "folder-base")).toBe(true);
  });
});
