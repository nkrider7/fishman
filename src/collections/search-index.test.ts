import { describe, expect, it } from "vitest";
import {
  buildRequestSearchIndex,
  filterSearchIndex,
} from "./search-index";
import type { CollectionFolder, SavedRequest } from "@/types/collection";

const folders: CollectionFolder[] = [
  {
    id: "root",
    workspace_id: "w",
    parent_id: null,
    name: "API",
    sort_order: 0,
    created_at: 1,
    updated_at: 1,
  },
];

const requests = [
  {
    id: "1",
    name: "Health",
    method: "GET",
    url: "/health",
    collection_id: "root",
    headers_json: "[]",
    params_json: "[]",
    body_type: "none",
    body_json: "",
    auth_type: "none",
    auth_json: "{}",
    created_at: 1,
    updated_at: 1,
    sort_order: 0,
    is_favorite: 0,
  },
] as SavedRequest[];

describe("search-index", () => {
  it("indexes folder path", () => {
    const index = buildRequestSearchIndex(requests, folders);
    expect(index[0]!.folderPath).toBe("API");
  });

  it("returns all when query empty", () => {
    const index = buildRequestSearchIndex(requests, folders);
    expect(filterSearchIndex(index, "")).toHaveLength(1);
  });
});
