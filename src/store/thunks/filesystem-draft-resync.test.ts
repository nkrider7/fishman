import { describe, expect, it } from "vitest";
import { planFilesystemDraftResync } from "./filesystem-draft-resync";
import type { SavedRequest } from "@/types/collection";
import type { Tab } from "@/types/request";

function saved(partial: Partial<SavedRequest> & { id: string; url: string }): SavedRequest {
  return {
    id: partial.id,
    name: partial.name ?? "Login",
    method: partial.method ?? "POST",
    url: partial.url,
    headers_json: "[]",
    params_json: "[]",
    body_type: "json",
    body_json: "",
    auth_type: "none",
    auth_json: '{"type":"none"}',
    scripts_json: undefined,
    tags_json: undefined,
    collection_id: partial.collection_id ?? "folder-1",
    sort_order: 0,
    is_favorite: 0,
    created_at: 0,
    updated_at: 0,
  };
}

describe("planFilesystemDraftResync", () => {
  it("reloads open request drafts from the new branch tree", () => {
    const tabId = "tab-1";
    const tabs: Tab[] = [
      {
        id: tabId,
        title: "Login",
        unsaved: true,
        pinned: false,
        requestId: "req-login",
      },
    ];
    const requests = [
      saved({
        id: "req-login",
        url: "http://localhost:3000/api/v1/auth/login",
      }),
    ];

    const plan = planFilesystemDraftResync({ tabs, requests });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.draft.url).toBe(
      "http://localhost:3000/api/v1/auth/login",
    );
    expect(plan.missingRequestIds).toEqual([]);
    expect(plan.clearResponseTabIds).toEqual([tabId]);
  });

  it("marks requests missing on the new branch for tab close", () => {
    const tabs: Tab[] = [
      {
        id: "tab-1",
        title: "Only on dev",
        unsaved: false,
        pinned: false,
        requestId: "req-dev-only",
      },
    ];

    const plan = planFilesystemDraftResync({
      tabs,
      requests: [saved({ id: "other", url: "https://example.com" })],
    });
    expect(plan.updates).toEqual([]);
    expect(plan.missingRequestIds).toEqual(["req-dev-only"]);
  });

  it("leaves untitled tabs alone", () => {
    const tabs: Tab[] = [
      {
        id: "tab-new",
        title: "Untitled Request",
        unsaved: true,
        pinned: false,
      },
    ];

    const plan = planFilesystemDraftResync({
      tabs,
      requests: [saved({ id: "req-1", url: "https://example.com" })],
    });
    expect(plan.updates).toEqual([]);
    expect(plan.missingRequestIds).toEqual([]);
  });
});
