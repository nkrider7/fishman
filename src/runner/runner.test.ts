import { describe, expect, it } from "vitest";
import { buildRunnerQueue } from "./build-queue";
import { filterQueueByTags, parseTagInput } from "./filter-tags";
import {
  parseCsvDataFile,
  parseJsonDataFile,
  resolveIterationRows,
} from "./data-file";
import { resolveNextRequestIndex } from "./control-flow";
import { judgeResultStatus } from "./types";
import type { CollectionFolder, SavedRequest } from "@/types/collection";

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
  partial: Partial<SavedRequest> &
    Pick<SavedRequest, "id" | "name" | "collection_id">,
): SavedRequest {
  return {
    method: "GET",
    url: "https://example.com",
    headers_json: "[]",
    params_json: "[]",
    body_type: "none",
    body_json: "",
    auth_type: "none",
    auth_json: "{}",
    tags_json: "[]",
    is_favorite: 0,
    sort_order: 0,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("buildRunnerQueue", () => {
  it("walks folders depth-first by sort_order", () => {
    const folders = [
      folder({ id: "root", name: "API" }),
      folder({ id: "auth", name: "Auth", parent_id: "root", sort_order: 1 }),
      folder({ id: "users", name: "Users", parent_id: "root", sort_order: 2 }),
    ];
    const requests = [
      request({
        id: "r1",
        name: "Login",
        collection_id: "auth",
        method: "POST",
        sort_order: 1,
      }),
      request({
        id: "r2",
        name: "List",
        collection_id: "users",
        sort_order: 1,
      }),
      request({
        id: "r0",
        name: "Health",
        collection_id: "root",
        sort_order: 0,
      }),
    ];

    const queue = buildRunnerQueue("root", null, folders, requests);
    expect(queue.map((q) => q.name)).toEqual(["Health", "Login", "List"]);
    expect(queue[1].folderPath).toBe("Auth");
  });

  it("limits to a folder subtree", () => {
    const folders = [
      folder({ id: "root", name: "API" }),
      folder({ id: "auth", name: "Auth", parent_id: "root" }),
    ];
    const requests = [
      request({ id: "r1", name: "Login", collection_id: "auth" }),
      request({ id: "r2", name: "Other", collection_id: "root" }),
    ];
    const queue = buildRunnerQueue("root", "auth", folders, requests);
    expect(queue.map((q) => q.name)).toEqual(["Login"]);
  });
});

describe("filterQueueByTags", () => {
  const items = [
    {
      requestId: "1",
      name: "A",
      method: "GET",
      folderPath: "",
      tags: ["smoke"],
    },
    {
      requestId: "2",
      name: "B",
      method: "GET",
      folderPath: "",
      tags: ["slow", "smoke"],
    },
    {
      requestId: "3",
      name: "C",
      method: "GET",
      folderPath: "",
      tags: [],
    },
  ];

  it("includes and excludes tags", () => {
    expect(
      filterQueueByTags(items, ["smoke"], ["slow"]).map((i) => i.name),
    ).toEqual(["A"]);
  });

  it("parses tag input", () => {
    expect(parseTagInput(" smoke, regression , ")).toEqual([
      "smoke",
      "regression",
    ]);
  });
});

describe("data-file", () => {
  it("parses CSV", () => {
    const rows = parseCsvDataFile("user,pass\na,1\nb,2\n");
    expect(rows).toEqual([
      { user: "a", pass: "1" },
      { user: "b", pass: "2" },
    ]);
  });

  it("parses JSON array", () => {
    const rows = parseJsonDataFile('[{"user":"a"},{"user":"b"}]');
    expect(rows).toEqual([{ user: "a" }, { user: "b" }]);
  });

  it("resolves iteration rows", () => {
    expect(resolveIterationRows(3).length).toBe(3);
    expect(resolveIterationRows(1, [{ a: 1 }, { a: 2 }]).length).toBe(1);
    expect(resolveIterationRows(0, [{ a: 1 }, { a: 2 }]).length).toBe(2);
  });
});

describe("control-flow", () => {
  const queue = [
    {
      requestId: "1",
      name: "Login",
      method: "POST",
      folderPath: "Auth",
      tags: [],
    },
    {
      requestId: "2",
      name: "Me",
      method: "GET",
      folderPath: "Auth",
      tags: [],
    },
    {
      requestId: "3",
      name: "Logout",
      method: "POST",
      folderPath: "Auth",
      tags: [],
    },
  ];

  it("resolves next request by name after current", () => {
    expect(resolveNextRequestIndex(queue, "Logout", 0)).toBe(2);
    expect(resolveNextRequestIndex(queue, "missing", 0)).toBe(-1);
  });
});

describe("judgeResultStatus", () => {
  it("marks skipped, failed tests, and http errors", () => {
    expect(
      judgeResultStatus({
        skipped: true,
        failOnHttpError: false,
        tests: [],
      }),
    ).toBe("skipped");

    expect(
      judgeResultStatus({
        skipped: false,
        failOnHttpError: false,
        httpStatus: 500,
        tests: [],
      }),
    ).toBe("passed");

    expect(
      judgeResultStatus({
        skipped: false,
        failOnHttpError: true,
        httpStatus: 500,
        tests: [],
      }),
    ).toBe("failed");

    expect(
      judgeResultStatus({
        skipped: false,
        failOnHttpError: false,
        httpStatus: 200,
        tests: [
          { name: "ok", status: "failed", durationMs: 1, error: { message: "x" } },
        ],
      }),
    ).toBe("failed");
  });
});
