import type { Tab } from "@/types/request";
import type { SavedRequest } from "@/types/collection";
import { rowToRequest } from "@/services/dbService";

export interface DiskReloadPlan {
  /** Clean tabs to overwrite from disk. */
  updates: Array<{ tabId: string; draft: ReturnType<typeof rowToRequest>; title: string }>;
  /** Tabs with unsaved edits whose on-disk file also changed — do not clobber. */
  diskChangedUnsavedTabIds: string[];
  missingRequestIds: string[];
  clearResponseTabIds: string[];
}

function isRequestTab(tab: Tab): boolean {
  return !tab.kind || tab.kind === "request";
}

/**
 * Plan how to apply a filesystem reload to open tabs.
 *
 * Policy: unsaved tabs are never overwritten. Clean tabs always take disk.
 */
export function planDiskReload(input: {
  tabs: Tab[];
  /** Previous request ids known to the UI (before reload). */
  previousRequestIds: Set<string>;
  /** Fresh rows from disk. */
  requests: SavedRequest[];
}): DiskReloadPlan {
  const byId = new Map(input.requests.map((r) => [r.id, r]));
  const updates: DiskReloadPlan["updates"] = [];
  const diskChangedUnsavedTabIds: string[] = [];
  const missing = new Set<string>();
  const clearResponseTabIds: string[] = [];

  for (const tab of input.tabs) {
    if (!isRequestTab(tab)) continue;
    const requestId = tab.requestId;
    if (!requestId) continue;

    const row = byId.get(requestId);
    if (!row) {
      if (!tab.unsaved) missing.add(requestId);
      // Unsaved orphan: keep editing; file may return on next reload
      continue;
    }

    if (tab.unsaved) {
      diskChangedUnsavedTabIds.push(tab.id);
      continue;
    }

    const draft = rowToRequest(row);
    updates.push({ tabId: tab.id, draft, title: draft.name });
    clearResponseTabIds.push(tab.id);
  }

  // Requests that vanished entirely (only mark missing if we previously had them)
  for (const id of input.previousRequestIds) {
    if (!byId.has(id)) missing.add(id);
  }

  return {
    updates,
    diskChangedUnsavedTabIds,
    missingRequestIds: Array.from(missing),
    clearResponseTabIds,
  };
}

export function hasConflictMarkers(text: string): boolean {
  return (
    text.includes("<<<<<<<") &&
    text.includes(">>>>>>>") &&
    (text.includes("=======") || text.includes("|||||||"))
  );
}

export function countConflictedPaths(
  changes: Array<{ status: string }>,
): number {
  return changes.filter((c) => c.status === "conflicted").length;
}

export function canCommitWithConflicts(input: {
  message: string;
  stagedCount: number;
  conflictedCount: number;
  busy?: boolean;
}): { ok: boolean; reason?: string } {
  if (input.busy) return { ok: false, reason: "Git is busy" };
  if (input.conflictedCount > 0) {
    return {
      ok: false,
      reason: `Resolve ${input.conflictedCount} conflict${input.conflictedCount === 1 ? "" : "s"} before committing`,
    };
  }
  if (!input.message.trim()) {
    return { ok: false, reason: "Enter a commit message" };
  }
  if (input.stagedCount === 0) {
    return { ok: false, reason: "Stage files before committing" };
  }
  return { ok: true };
}
