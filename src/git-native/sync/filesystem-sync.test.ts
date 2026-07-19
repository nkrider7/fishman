import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  AutoSaveScheduler,
  markSelfWrite,
  isSelfWrite,
  clearSelfWrites,
  anySelfWrite,
  planDiskReload,
  hasConflictMarkers,
  canCommitWithConflicts,
  countConflictedPaths,
} from "@/git-native";
import {
  buildRequestSearchIndex,
  filterSearchIndex,
} from "@/collections/search-index";
import type { CollectionFolder, SavedRequest } from "@/types/collection";
import type { Tab } from "@/types/request";

describe("self-write markers", () => {
  beforeEach(() => clearSelfWrites());

  it("marks and expires", () => {
    markSelfWrite("/proj/fishman/a.fish", 50);
    expect(isSelfWrite("/proj/fishman/a.fish")).toBe(true);
    expect(anySelfWrite(["/proj/fishman/a.fish"])).toBe(true);
  });

  it("normalizes slashes", () => {
    markSelfWrite("proj\\fishman\\a.fish");
    expect(isSelfWrite("proj/fishman/a.fish")).toBe(true);
  });
});

describe("AutoSaveScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid schedules into one write", async () => {
    const write = vi.fn(async () => {});
    const s = new AutoSaveScheduler({ debounceMs: 100, write });
    s.schedule("req1");
    s.schedule("req1");
    s.schedule("req1");
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("req1");
    s.destroy();
  });

  it("flush runs immediately", async () => {
    const write = vi.fn(async () => {});
    const s = new AutoSaveScheduler({ debounceMs: 5000, write });
    s.schedule("req1");
    await s.flush("req1");
    expect(write).toHaveBeenCalledTimes(1);
    s.destroy();
  });
});

describe("planDiskReload", () => {
  const req = (id: string): SavedRequest =>
    ({
      id,
      name: id,
      method: "GET",
      url: "/",
      headers_json: "[]",
      params_json: "[]",
      body_type: "none",
      body_json: "",
      auth_type: "none",
      auth_json: "{}",
      collection_id: null,
      created_at: 1,
      updated_at: 1,
      sort_order: 0,
      is_favorite: 0,
      source_kind: "filesystem",
      source_path: `collections/${id}.fish`,
      sync_status: "synced",
    }) as SavedRequest;

  const tab = (partial: Partial<Tab> & { id: string }): Tab =>
    ({
      title: "t",
      unsaved: false,
      ...partial,
    }) as Tab;

  it("updates clean tabs and skips unsaved", () => {
    const plan = planDiskReload({
      tabs: [
        tab({ id: "t1", requestId: "a", unsaved: false }),
        tab({ id: "t2", requestId: "b", unsaved: true }),
      ],
      previousRequestIds: new Set(["a", "b"]),
      requests: [req("a"), req("b")],
    });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.tabId).toBe("t1");
    expect(plan.diskChangedUnsavedTabIds).toEqual(["t2"]);
  });
});

describe("conflict helpers", () => {
  it("detects markers", () => {
    expect(hasConflictMarkers("<<<<<<<\na\n=======\nb\n>>>>>>>")).toBe(true);
    expect(hasConflictMarkers("plain")).toBe(false);
  });

  it("blocks commit when conflicted", () => {
    const r = canCommitWithConflicts({
      message: "ok",
      stagedCount: 2,
      conflictedCount: 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/conflict/i);
  });

  it("counts conflicted paths", () => {
    expect(
      countConflictedPaths([
        { status: "modified" },
        { status: "conflicted" },
        { status: "conflicted" },
      ]),
    ).toBe(2);
  });
});

describe("search index", () => {
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
    {
      id: "auth",
      workspace_id: "w",
      parent_id: "root",
      name: "Auth",
      sort_order: 1,
      created_at: 1,
      updated_at: 1,
    },
  ];

  const requests = [
    {
      id: "1",
      name: "Login",
      method: "POST",
      url: "/login",
      collection_id: "auth",
      headers_json: "[]",
      params_json: "[]",
      body_type: "json",
      body_json: "",
      auth_type: "none",
      auth_json: "{}",
      created_at: 1,
      updated_at: 1,
      sort_order: 0,
      is_favorite: 0,
    },
    {
      id: "2",
      name: "List users",
      method: "GET",
      url: "/users",
      collection_id: "root",
      headers_json: "[]",
      params_json: "[]",
      body_type: "none",
      body_json: "",
      auth_type: "none",
      auth_json: "{}",
      created_at: 1,
      updated_at: 1,
      sort_order: 1,
      is_favorite: 0,
    },
  ] as SavedRequest[];

  it("builds folder paths and filters by method", () => {
    const index = buildRequestSearchIndex(requests, folders);
    expect(index[0]!.folderPath).toContain("Auth");
    const filtered = filterSearchIndex(index, "method:POST");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("Login");
  });
});
