import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "../index";
import { setLoading, setResponse } from "../slices/responseSlice";
import { addHistory } from "../slices/historySlice";
import { updateTab } from "../slices/tabsSlice";
import { updateDraft } from "../slices/requestSlice";
import { selectResolvedVariables } from "../slices/environmentSlice";
import {
  setScriptPipelineResult,
  setScriptRunning,
} from "../slices/scriptExecutionSlice";
import { setScriptConsoleVisible } from "../slices/uiSlice";
import { appendNetworkLog } from "../slices/networkLogSlice";
import { ingestSetCookies, upsertCookie } from "../slices/cookiesSlice";
import { findRootCollectionId } from "@/utils/collectionUtils";
import { hasScriptError } from "@/script-engine";
import { detectQuerySupport } from "@/http-methods";
import { normalizeDomain } from "@/utils/cookies";
import { buildNetworkLogEntry } from "@/utils/networkLog";
import type { CookieChange } from "@/types/cookie";
import {
  executeOneRequest,
  getPipelineCookieChanges,
  getPipelineVariableChanges,
} from "@/services/requestExecutor";
import { applyScriptVariableChanges } from "@/store/thunks/applyScriptVariableChanges";

async function applyScriptCookieChanges(
  requestUrl: string,
  changes: CookieChange[] | undefined,
  dispatch: (action: unknown) => unknown,
) {
  if (!changes?.length) return;
  let host = "";
  try {
    host = new URL(requestUrl).hostname;
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
}

export const sendRequestThunk = createAsyncThunk(
  "request/send",
  async (tabId: string, { getState, dispatch }) => {
    const fail = (statusText: string, message: string) => {
      dispatch(setScriptRunning({ tabId, running: false }));
      dispatch(setLoading({ tabId, loading: false }));
      dispatch(
        setResponse({
          tabId,
          response: {
            status: 0,
            status_text: statusText,
            headers: {},
            body: message,
            size_bytes: 0,
            duration_ms: 0,
            timing: {
              total_ms: 0,
              dns_ms: null,
              connect_ms: null,
              ttfb_ms: null,
            },
            error: message,
          },
        }),
      );
    };

    try {
      const state = getState() as RootState;
      const draft = state.request.drafts[tabId];
      if (!draft) {
        fail("Error", "No request draft found");
        throw new Error("No request draft found");
      }

      dispatch(setLoading({ tabId, loading: true }));
      dispatch(setScriptRunning({ tabId, running: true }));

      const rootCollectionId = findRootCollectionId(
        draft.collectionId,
        state.collections.folders,
      );
      const variables = selectResolvedVariables(state, rootCollectionId);
      let jarCookies = state.cookies.cookies;

      const requestStartedAt = Date.now();
      const result = await executeOneRequest({
        request: draft,
        variables,
        cookies: jarCookies,
        folders: state.collections.folders,
        settings: {
          ignoreSsl: state.settings.ignoreSsl,
          timeoutMs: state.settings.timeoutMs,
        },
        requestName: draft.name,
      });

      // Apply pre-request cookie changes from pipeline, then re-read jar if needed.
      const cookieChanges = getPipelineCookieChanges(result.pipeline);
      if (cookieChanges.length) {
        await applyScriptCookieChanges(
          result.resolvedRequest.url || draft.url,
          cookieChanges,
          dispatch,
        );
        jarCookies = (getState() as RootState).cookies.cookies;
      }

      // Persist fm.environment.set / globals / collectionVariables into active envs.
      await applyScriptVariableChanges(
        getPipelineVariableChanges(result.pipeline),
        rootCollectionId,
        () => getState() as RootState,
        dispatch,
      );

      // Re-run is not needed; cookies for HTTP were selected before send.
      // Ingest Set-Cookie from the response.
      if (result.response?.set_cookies?.length) {
        try {
          await dispatch(
            ingestSetCookies({
              setCookies: result.response.set_cookies,
            }),
          ).unwrap();
        } catch (cookieError) {
          console.error("[fishman] failed to ingest Set-Cookie", cookieError);
        }
      }

      dispatch(updateDraft({ tabId, changes: result.request }));

      if (result.skipped) {
        const message = "Request aborted by pre-request script";
        dispatch(
          setScriptPipelineResult({ tabId, result: result.pipeline }),
        );
        dispatch(
          appendNetworkLog(
            buildNetworkLogEntry({
              method: result.request.method || draft.method,
              url: result.resolvedRequest.url || draft.url,
              statusCode: null,
              durationMs: Date.now() - requestStartedAt,
              sizeBytes: null,
              startedAt: requestStartedAt,
              tabId,
              error: message,
            }),
          ),
        );
        if (hasScriptError(result.pipeline)) {
          dispatch(setScriptConsoleVisible(true));
        }
        fail("Aborted", message);
        throw new Error(message);
      }

      if (!result.response) {
        const message = result.errorMessage ?? "Request failed";
        dispatch(
          setScriptPipelineResult({ tabId, result: result.pipeline }),
        );
        dispatch(
          appendNetworkLog(
            buildNetworkLogEntry({
              method: result.request.method || draft.method,
              url: result.resolvedRequest.url || draft.url,
              statusCode: null,
              durationMs: Date.now() - requestStartedAt,
              sizeBytes: null,
              startedAt: requestStartedAt,
              tabId,
              error: message,
            }),
          ),
        );
        if (hasScriptError(result.pipeline)) {
          dispatch(setScriptConsoleVisible(true));
        }
        fail("Error", message);
        throw new Error(message);
      }

      let querySupport = null;
      try {
        querySupport = detectQuerySupport(
          result.request.url,
          result.response,
          result.request.method,
        );
      } catch {
        // Capability detection must never block the response.
      }

      dispatch(
        setScriptPipelineResult({ tabId, result: result.pipeline }),
      );
      dispatch(
        setResponse({
          tabId,
          response: { ...result.response, query_support: querySupport },
        }),
      );

      if (hasScriptError(result.pipeline)) {
        dispatch(setScriptConsoleVisible(true));
      }

      dispatch(
        appendNetworkLog(
          buildNetworkLogEntry({
            method: result.request.method,
            url: result.request.url,
            statusCode: result.response.status,
            durationMs: result.response.duration_ms,
            sizeBytes: result.response.size_bytes,
            startedAt: requestStartedAt,
            tabId,
          }),
        ),
      );

      void dispatch(
        addHistory({
          request_id: result.request.id,
          method: result.request.method,
          url: result.request.url,
          status_code: result.response.status,
          duration_ms: result.response.duration_ms,
          response_size: result.response.size_bytes,
          request_snapshot_json: JSON.stringify(result.request),
          response_snapshot_json: JSON.stringify(result.response),
        }),
      );

      dispatch(
        updateTab({
          id: tabId,
          changes: {
            title:
              result.request.name || result.request.url || "Untitled Request",
          },
        }),
      );

      dispatch(setScriptRunning({ tabId, running: false }));
      dispatch(setLoading({ tabId, loading: false }));

      return result.response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      const state = getState() as RootState;
      if (!state.response.responses[tabId]?.error) {
        fail("Error", message);
      } else {
        dispatch(setScriptRunning({ tabId, running: false }));
        dispatch(setLoading({ tabId, loading: false }));
      }
      throw error;
    }
  },
);
