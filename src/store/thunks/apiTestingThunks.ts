import { createAsyncThunk } from "@reduxjs/toolkit";
import { runApiTest } from "@/api-testing";
import type { RootState } from "../index";
import { selectResolvedVariables } from "../slices/environmentSlice";
import { findRootCollectionId } from "@/utils/collectionUtils";
import {
  setApiTestingError,
  setApiTestingRunSnapshot,
  setApiTestingRunning,
  setApiTestingView,
} from "../slices/apiTestingSlice";

let activeAbort: AbortController | null = null;

export const startApiTest = createAsyncThunk(
  "apiTesting/start",
  async (_arg, { getState, dispatch }) => {
    const state = getState() as RootState;
    const config = state.apiTesting.config;
    const url = config.url.trim();
    if (!url) {
      dispatch(setApiTestingError("Enter a request URL before running."));
      throw new Error("URL required");
    }
    if (config.virtualUsers < 1 && config.testType !== "stress") {
      dispatch(setApiTestingError("Virtual users must be at least 1."));
      throw new Error("Invalid VUs");
    }

    // Cancel any previous run
    activeAbort?.abort();
    const ac = new AbortController();
    activeAbort = ac;

    dispatch(setApiTestingError(null));
    dispatch(setApiTestingRunning(true));
    dispatch(setApiTestingView("results"));

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
      }
      throw err;
    } finally {
      if (activeAbort === ac) activeAbort = null;
      dispatch(setApiTestingRunning(false));
    }
  },
);

export const stopApiTest = createAsyncThunk(
  "apiTesting/stop",
  async () => {
    activeAbort?.abort();
    activeAbort = null;
  },
);
