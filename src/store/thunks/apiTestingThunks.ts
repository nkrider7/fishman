import { createAsyncThunk } from "@reduxjs/toolkit";
import { runApiTest, validateApiTestConfig } from "@/api-testing";
import type { RootState } from "../index";
import { selectResolvedVariables } from "../slices/environmentSlice";
import { findRootCollectionId } from "@/utils/collectionUtils";
import {
  beginApiTestingRun,
  setApiTestingError,
  setApiTestingRunSnapshot,
  setApiTestingRunning,
  setApiTestingView,
} from "../slices/apiTestingSlice";

/** Single active run controller — replaced on each start; stop is idempotent. */
let activeAbort: AbortController | null = null;

export function isApiTestAbortActive(): boolean {
  return activeAbort !== null && !activeAbort.signal.aborted;
}

export const startApiTest = createAsyncThunk(
  "apiTesting/start",
  async (_arg, { getState, dispatch }) => {
    const state = getState() as RootState;
    const config = state.apiTesting.config;

    const validation = validateApiTestConfig(config);
    if (!validation.ok) {
      dispatch(setApiTestingError(validation.errors[0] ?? "Invalid config"));
      dispatch(setApiTestingView("config"));
      throw new Error(validation.errors[0] ?? "Invalid config");
    }

    // Cancel any previous run cleanly
    activeAbort?.abort();
    const ac = new AbortController();
    activeAbort = ac;

    dispatch(beginApiTestingRun());

    const activeTabId = state.tabs.activeTabId;
    const draft = activeTabId ? state.request.drafts[activeTabId] : null;
    const rootCollectionId = findRootCollectionId(
      draft?.collectionId,
      state.collections.folders,
    );
    const variables = selectResolvedVariables(state, rootCollectionId);

    try {
      const final = await runApiTest({
        config,
        variables,
        cookies: state.cookies.cookies,
        ignoreSsl: state.settings.ignoreSsl,
        signal: ac.signal,
        onUpdate: (snap) => {
          dispatch(setApiTestingRunSnapshot(snap));
        },
      });
      return final;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!ac.signal.aborted) {
        dispatch(setApiTestingError(message));
        dispatch(setApiTestingView("config"));
        dispatch(setApiTestingRunning(false));
      }
      throw err;
    } finally {
      if (activeAbort === ac) activeAbort = null;
      // Final snapshot from engine already cleared running; belt-and-suspenders:
      const latest = (getState() as RootState).apiTesting.run.phase;
      if (latest !== "running" && latest !== "stopping") {
        dispatch(setApiTestingRunning(false));
      }
    }
  },
);

export const stopApiTest = createAsyncThunk("apiTesting/stop", async () => {
  // Idempotent — safe on double-click
  if (activeAbort) {
    activeAbort.abort();
  }
});

/** Abort any live run (dialog close / navigate back). Idempotent. */
export const abortApiTestIfRunning = createAsyncThunk(
  "apiTesting/abortIfRunning",
  async (_, { getState, dispatch }) => {
    const running = (getState() as RootState).apiTesting.running;
    if (running || activeAbort) {
      activeAbort?.abort();
      // Engine emits cancelled snapshot; if nothing was running, clear flag.
      if (!activeAbort) {
        dispatch(setApiTestingRunning(false));
      }
    }
  },
);
