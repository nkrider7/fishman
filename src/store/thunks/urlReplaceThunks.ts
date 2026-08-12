import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "../index";
import { saveRequestToDb } from "../slices/collectionsSlice";
import { updateEnvironment } from "../slices/environmentSlice";
import { updateDraft } from "../slices/requestSlice";
import { updateTab } from "../slices/tabsSlice";
import { saveFolderSettingsPayload } from "./collectionSettingsThunks";
import { rowToRequest } from "@/services/dbService";
import {
  parseFolderSettings,
  type FolderSettings,
} from "@/types/collection";
import type { KeyValue } from "@/types/request";
import type { UrlReplaceMatch, UrlReplaceUndoEntry } from "@/url-replace/types";
import { pushUndo, popUndo } from "@/url-replace/undo-stack";

function allEnvironments(state: RootState) {
  const list = [...state.environments.globalEnvironments];
  for (const envs of Object.values(state.environments.collectionEnvironments)) {
    list.push(...envs);
  }
  return list;
}

export interface ApplyUrlReplaceResult {
  applied: number;
  errors: string[];
}

type RequestPatch = {
  url?: string;
  body?: string;
  params?: KeyValue[];
};

/**
 * Apply selected matches: persist requests/folders/envs and sync open tabs.
 * Multiple fields on the same request are merged into one save.
 */
export const applyUrlReplaceMatches = createAsyncThunk<
  ApplyUrlReplaceResult,
  { matches: UrlReplaceMatch[] },
  { state: RootState; dispatch: AppDispatch }
>("urlReplace/apply", async ({ matches }, { getState, dispatch }) => {
  const selected = matches.filter((m) => m.selected && m.before !== m.after);
  if (selected.length === 0) {
    return { applied: 0, errors: [] };
  }

  const undo: UrlReplaceUndoEntry = {
    matches: selected.map((m) => ({
      id: m.id,
      kind: m.kind,
      field: m.field,
      targetId: m.targetId,
      variableId: m.variableId,
      paramPart: m.paramPart,
      before: m.before,
      after: m.after,
    })),
    appliedAt: Date.now(),
  };

  const errors: string[] = [];
  let applied = 0;
  const state = getState();

  const envPatches = new Map<string, Map<string, string>>();
  const requestPatches = new Map<string, RequestPatch>();
  const tabPatches = new Map<string, RequestPatch>();

  for (const m of selected) {
    if (m.kind === "env-var" && m.variableId) {
      let vars = envPatches.get(m.targetId);
      if (!vars) {
        vars = new Map();
        envPatches.set(m.targetId, vars);
      }
      vars.set(m.variableId, m.after);
      continue;
    }

    if (m.kind === "folder-base") {
      try {
        const folder = state.collections.folders.find(
          (f) => f.id === m.targetId,
        );
        if (!folder) {
          errors.push(`Folder not found: ${m.name}`);
          continue;
        }
        const settings: FolderSettings = parseFolderSettings(folder);
        settings.presets = { ...settings.presets, baseUrl: m.after };
        await dispatch(
          saveFolderSettingsPayload({ folderId: folder.id, settings }),
        ).unwrap();
        applied += 1;
      } catch (err) {
        errors.push(
          `${m.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      continue;
    }

    if (m.kind === "open-tab" || m.id.startsWith("tab-")) {
      const patch = tabPatches.get(m.targetId) ?? {};
      if (m.field === "body") patch.body = m.after;
      else patch.url = m.after;
      tabPatches.set(m.targetId, patch);
      continue;
    }

    // Saved request fields
    const patch = requestPatches.get(m.targetId) ?? {};
    if (m.field === "url" || m.kind === "websocket" || m.kind === "request-url") {
      patch.url = m.after;
    } else if (m.field === "body" || m.kind === "request-body") {
      patch.body = m.after;
    } else if (
      (m.field === "param" || m.kind === "request-param") &&
      m.variableId &&
      m.paramPart
    ) {
      const row = state.collections.requests.find((r) => r.id === m.targetId);
      if (!row) {
        errors.push(`Request not found: ${m.name}`);
        continue;
      }
      const draft = rowToRequest(row);
      const params = patch.params ?? draft.params.map((p) => ({ ...p }));
      const idx = params.findIndex((p) => p.id === m.variableId);
      if (idx >= 0) {
        const next = { ...params[idx]! };
        if (m.paramPart === "key") next.key = m.after;
        else next.value = m.after;
        params[idx] = next;
        patch.params = params;
      }
    }
    requestPatches.set(m.targetId, patch);
  }

  for (const [requestId, patch] of requestPatches) {
    try {
      const row = state.collections.requests.find((r) => r.id === requestId);
      if (!row) {
        errors.push(`Request not found: ${requestId}`);
        continue;
      }
      const draft = rowToRequest(row);
      if (patch.url !== undefined) draft.url = patch.url;
      if (patch.body !== undefined) {
        // Only replace raw/json/text bodies; graphql stored as query string in our scanner bodyText
        if (
          draft.bodyType === "json" ||
          draft.bodyType === "raw" ||
          draft.bodyType === "xml" ||
          draft.bodyType === "html" ||
          draft.bodyType === "none"
        ) {
          draft.body = patch.body;
        } else if (draft.bodyType === "graphql" && draft.graphql) {
          // Prefer replacing in query if match was from combined text — apply to query
          draft.graphql = { ...draft.graphql, query: patch.body };
          draft.body = patch.body;
        } else {
          draft.body = patch.body;
        }
      }
      if (patch.params) draft.params = patch.params;

      await dispatch(
        saveRequestToDb({
          request: draft,
          collectionId: row.collection_id,
        }),
      ).unwrap();

      for (const tab of state.tabs.tabs) {
        if (tab.requestId !== requestId) continue;
        if (tab.kind && tab.kind !== "request") continue;
        const changes: Record<string, unknown> = {};
        if (patch.url !== undefined) changes.url = patch.url;
        if (patch.body !== undefined) changes.body = patch.body;
        if (patch.params) changes.params = patch.params;
        if (Object.keys(changes).length > 0) {
          dispatch(updateDraft({ tabId: tab.id, changes }));
        }
      }
      applied += 1;
    } catch (err) {
      errors.push(
        `${requestId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  for (const [tabId, patch] of tabPatches) {
    try {
      const changes: Record<string, unknown> = {};
      if (patch.url !== undefined) changes.url = patch.url;
      if (patch.body !== undefined) changes.body = patch.body;
      dispatch(updateDraft({ tabId, changes }));
      dispatch(updateTab({ id: tabId, changes: { unsaved: true } }));
      applied += 1;
    } catch (err) {
      errors.push(
        `Tab ${tabId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  for (const [envId, varMap] of envPatches) {
    try {
      const env = allEnvironments(getState()).find((e) => e.id === envId);
      if (!env) {
        errors.push(`Environment not found: ${envId}`);
        continue;
      }
      const variables = env.variables.map((v) =>
        varMap.has(v.id) ? { ...v, value: varMap.get(v.id)! } : v,
      );
      await dispatch(updateEnvironment({ id: envId, variables })).unwrap();
      applied += varMap.size;
    } catch (err) {
      errors.push(
        `Environment ${envId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (applied > 0) {
    pushUndo(undo);
  }

  return { applied, errors };
});

export const undoUrlReplace = createAsyncThunk<
  ApplyUrlReplaceResult,
  void,
  { state: RootState; dispatch: AppDispatch }
>("urlReplace/undo", async (_arg, { dispatch }) => {
  const entry = popUndo();
  if (!entry) return { applied: 0, errors: ["Nothing to undo"] };

  const reverse: UrlReplaceMatch[] = entry.matches.map((m) => ({
    id: m.id,
    kind: m.kind,
    field: m.field,
    targetId: m.targetId,
    variableId: m.variableId,
    paramPart: m.paramPart,
    name: m.id,
    breadcrumb: "",
    before: m.after,
    after: m.before,
    occurrenceCount: 1,
    matchStart: 0,
    matchLength: 0,
    selected: true,
  }));

  const result = await dispatch(
    applyUrlReplaceMatches({ matches: reverse }),
  ).unwrap();
  popUndo();
  return result;
});
