import { createAsyncThunk } from "@reduxjs/toolkit";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { RootState } from "../index";
import { selectResolvedVariables } from "../slices/environmentSlice";
import { ingestSetCookies, upsertCookie } from "../slices/cookiesSlice";
import { addHistory } from "../slices/historySlice";
import {
  openRunnerSession,
  patchRunnerConfig,
  runnerItemUpsert,
  runnerRunFinished,
  runnerRunStarted,
} from "../slices/runnerSlice";
import { addTab, setActiveTab, updateTab } from "../slices/tabsSlice";
import { rowToRequest } from "@/services/dbService";
import {
  buildJsonReport,
  buildJUnitReport,
  buildHtmlReport,
  buildRunnerQueue,
  filterQueueByTags,
  parseDataFile,
  resolveIterationRows,
  runCollectionEngine,
} from "@/runner";
import { normalizeDomain } from "@/utils/cookies";
import { generateId } from "@/utils/id";
import { appendNetworkLog } from "../slices/networkLogSlice";
import { buildNetworkLogEntry } from "@/utils/networkLog";

let activeAbort: AbortController | null = null;

export const openCollectionRunner = createAsyncThunk(
  "runner/open",
  async (
    payload: { collectionId: string; folderId?: string | null },
    { getState, dispatch },
  ) => {
    const state = getState() as RootState;
    const collectionId = payload.collectionId;
    const folderId = payload.folderId ?? null;
    const root = state.collections.folders.find((f) => f.id === collectionId);
    const name = folderId
      ? (state.collections.folders.find((f) => f.id === folderId)?.name ??
        root?.name ??
        "Collection")
      : (root?.name ?? "Collection");

    const queue = buildRunnerQueue(
      collectionId,
      folderId,
      state.collections.folders,
      state.collections.requests,
    );

    const existingRunner = state.tabs.tabs.find((t) => t.kind === "runner");
    const tabId = existingRunner?.id ?? generateId();

    if (!existingRunner) {
      dispatch(
        addTab({
          id: tabId,
          title: `Runner · ${name}`,
          kind: "runner",
          runnerCollectionId: collectionId,
          runnerFolderId: folderId,
        }),
      );
    } else {
      dispatch(
        updateTab({
          id: tabId,
          changes: {
            title: `Runner · ${name}`,
            runnerCollectionId: collectionId,
            runnerFolderId: folderId,
          },
        }),
      );
      dispatch(setActiveTab(tabId));
    }

    dispatch(
      openRunnerSession({
        tabId,
        collectionId,
        folderId,
        collectionName: name,
        queue,
      }),
    );

    return { tabId };
  },
);

export const pickRunnerDataFile = createAsyncThunk(
  "runner/pickDataFile",
  async (_, { dispatch }) => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Data", extensions: ["json", "csv"] },
        { name: "All", extensions: ["*"] },
      ],
    });
    if (!selected || Array.isArray(selected)) return null;
    const content = await readTextFile(selected);
    const filename = selected.split(/[/\\]/).pop() ?? "data.json";
    const rows = parseDataFile(content, filename);
    dispatch(
      patchRunnerConfig({
        dataFileName: filename,
        dataRows: rows,
        iterations: rows.length || 1,
      }),
    );
    return { filename, count: rows.length };
  },
);

export const startCollectionRun = createAsyncThunk(
  "runner/start",
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const { config, selectedRequestIds, queue } = state.runner;
    if (!config) throw new Error("No runner session");

    if (activeAbort) {
      activeAbort.abort();
    }
    const abort = new AbortController();
    activeAbort = abort;

    const selectedSet = new Set(selectedRequestIds);
    const tagged = filterQueueByTags(
      queue.filter((q) => selectedSet.has(q.requestId)),
      config.includeTags,
      config.excludeTags,
    );

    // Preserve user selection order from selectedRequestIds when possible
    const byId = new Map(tagged.map((q) => [q.requestId, q]));
    const ordered = selectedRequestIds
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));

    const iterationRows = resolveIterationRows(
      config.iterations,
      config.dataRows,
    );

    const variables = selectResolvedVariables(state, config.collectionId);
    const runId = generateId();
    const startedAt = Date.now();
    dispatch(runnerRunStarted({ runId, startedAt }));

    const requestMap = new Map(
      state.collections.requests.map((r) => [r.id, r]),
    );

    try {
      const summary = await runCollectionEngine({
        config,
        queue: ordered,
        iterationRows,
        variables: { ...variables },
        folders: state.collections.folders,
        settings: {
          ignoreSsl: state.settings.ignoreSsl,
          timeoutMs: state.settings.timeoutMs,
        },
        signal: abort.signal,
        callbacks: {
          onItemStart: (result) => {
            dispatch(runnerItemUpsert(result));
          },
          onItemComplete: (result) => {
            dispatch(runnerItemUpsert(result));
            dispatch(
              appendNetworkLog(
                buildNetworkLogEntry({
                  method: result.method,
                  url: result.requestUrl ?? "",
                  statusCode: result.httpStatus ?? null,
                  durationMs: result.durationMs ?? null,
                  sizeBytes: result.responsePreview?.size_bytes ?? null,
                  error: result.errorMessage,
                }),
              ),
            );
            if (config.recordHistory && result.responsePreview) {
              void dispatch(
                addHistory({
                  request_id: result.requestId,
                  method: result.method,
                  url: result.requestUrl ?? "",
                  status_code: result.httpStatus ?? 0,
                  duration_ms: result.durationMs ?? 0,
                  response_size: result.responsePreview.size_bytes,
                  request_snapshot_json: "{}",
                  response_snapshot_json: JSON.stringify(
                    result.responsePreview,
                  ),
                }),
              );
            }
          },
          onCookieIngest: async (setCookies) => {
            await dispatch(ingestSetCookies({ setCookies })).unwrap();
          },
          onScriptCookies: async (url, changes) => {
            let host = "";
            try {
              host = new URL(url).hostname;
            } catch {
              return;
            }
            for (const change of changes) {
              await dispatch(
                upsertCookie({
                  domain: normalizeDomain(host),
                  name: change.name,
                  value: change.value,
                  path: "/",
                }),
              );
            }
          },
          getCookies: () => (getState() as RootState).cookies.cookies,
          loadRequest: (requestId) => {
            const row = requestMap.get(requestId);
            return row ? rowToRequest(row) : null;
          },
        },
      });

      dispatch(
        runnerRunFinished({
          finishedAt: Date.now(),
          cancelled: summary.cancelled,
        }),
      );

      // Variable persistence could update env — skipped for safety unless we
      // have a clear mapping; keep bag local for now when persistVariables.
      return summary;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Collection run failed";
      dispatch(
        runnerRunFinished({
          finishedAt: Date.now(),
          cancelled: abort.signal.aborted,
          error: message,
        }),
      );
      throw error;
    } finally {
      if (activeAbort === abort) activeAbort = null;
    }
  },
);

export const cancelCollectionRun = createAsyncThunk(
  "runner/cancel",
  async () => {
    activeAbort?.abort();
    activeAbort = null;
  },
);

export const downloadRunnerReport = createAsyncThunk(
  "runner/downloadReport",
  async (
    format: "json" | "junit" | "html",
    { getState },
  ) => {
    const state = getState() as RootState;
    const { config, results, startedAt, finishedAt } = state.runner;
    if (!config || !startedAt) throw new Error("No run to report");

    const envId = state.environments.activeGlobalEnvironmentId;
    const env = state.environments.globalEnvironments.find((e) => e.id === envId);

    const input = {
      config,
      environmentName: env?.name,
      startedAt,
      finishedAt: finishedAt ?? Date.now(),
      results,
    };

    const content =
      format === "json"
        ? buildJsonReport(input)
        : format === "junit"
          ? buildJUnitReport(input)
          : buildHtmlReport(input);

    const ext = format === "junit" ? "xml" : format;
    const path = await save({
      defaultPath: `${config.collectionName.replace(/\s+/g, "-").toLowerCase()}-run.${ext}`,
      filters: [
        {
          name: format.toUpperCase(),
          extensions: [ext],
        },
      ],
    });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  },
);
