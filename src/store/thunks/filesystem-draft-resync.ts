import type { SavedRequest } from "@/types/collection";
import type { RequestDraft, Tab } from "@/types/request";
import { rowToRequest } from "@/services/dbService";
import type { AppDispatch } from "../index";
import { setDraft } from "../slices/requestSlice";
import { updateTab } from "../slices/tabsSlice";
import { clearResponse } from "../slices/responseSlice";

export interface FilesystemDraftResyncPlan {
  /** Open request tabs to reload from disk. */
  updates: Array<{ tabId: string; draft: RequestDraft; title: string }>;
  /** Saved request ids that vanished on this branch — close their tabs. */
  missingRequestIds: string[];
  /** Clear cached responses for reloaded tabs. */
  clearResponseTabIds: string[];
}

function isRequestTab(tab: Tab): boolean {
  return !tab.kind || tab.kind === "request";
}

/**
 * After a git checkout/pull, map open tabs onto the re-read filesystem tree.
 * Untitled tabs (no saved request id) are left alone.
 */
export function planFilesystemDraftResync(input: {
  tabs: Tab[];
  requests: SavedRequest[];
}): FilesystemDraftResyncPlan {
  const byId = new Map(input.requests.map((r) => [r.id, r]));
  const updates: FilesystemDraftResyncPlan["updates"] = [];
  const missing = new Set<string>();
  const clearResponseTabIds: string[] = [];

  for (const tab of input.tabs) {
    if (!isRequestTab(tab)) continue;

    // Only saved requests (opened from collections) — untitled drafts keep a
    // generated draft.id but no tab.requestId.
    const requestId = tab.requestId;
    if (!requestId) continue;

    const row = byId.get(requestId);
    if (!row) {
      missing.add(requestId);
      continue;
    }

    const next = rowToRequest(row);
    updates.push({ tabId: tab.id, draft: next, title: next.name });
    clearResponseTabIds.push(tab.id);
  }

  return {
    updates,
    missingRequestIds: Array.from(missing),
    clearResponseTabIds,
  };
}

/** Apply planned draft/tab updates (caller handles closing missing request tabs). */
export function applyFilesystemDraftResync(
  dispatch: AppDispatch,
  plan: FilesystemDraftResyncPlan,
): void {
  for (const update of plan.updates) {
    dispatch(setDraft({ tabId: update.tabId, request: update.draft }));
    dispatch(
      updateTab({
        id: update.tabId,
        changes: {
          title: update.title,
          unsaved: false,
          requestId: update.draft.id,
        },
      }),
    );
  }
  for (const tabId of plan.clearResponseTabIds) {
    dispatch(clearResponse(tabId));
  }
}
