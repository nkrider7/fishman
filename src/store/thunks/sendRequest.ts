import { createAsyncThunk } from "@reduxjs/toolkit";
import { sendHttpRequest } from "@/services/apiService";
import type { RootState } from "../index";
import { setLoading, setResponse } from "../slices/responseSlice";
import { addHistory } from "../slices/historySlice";
import { updateTab } from "../slices/tabsSlice";
import { selectResolvedVariables } from "../slices/environmentSlice";
import { findRootCollectionId } from "@/utils/collectionUtils";
import {
  findUnresolvedVariables,
  substituteRequestDraft,
} from "@/utils/variableSubstitution";
import { validateRequest } from "@/utils/validation";

export const sendRequestThunk = createAsyncThunk(
  "request/send",
  async (tabId: string, { getState, dispatch }) => {
    const state = getState() as RootState;
    const request = state.request.drafts[tabId];
    if (!request) throw new Error("No request draft found");

    const rootCollectionId = findRootCollectionId(
      request.collectionId,
      state.collections.folders,
    );
    const variables = selectResolvedVariables(state, rootCollectionId);
    const resolvedRequest =
      Object.keys(variables).length > 0
        ? substituteRequestDraft(request, variables)
        : request;

    const unresolvedInUrl = findUnresolvedVariables(resolvedRequest.url);
    if (unresolvedInUrl.length > 0) {
      const validationError = `Unresolved variable(s) in URL: ${unresolvedInUrl.map((name) => `{{${name}}}`).join(", ")}`;
      dispatch(
        setResponse({
          tabId,
          response: {
            status: 0,
            status_text: "Validation Error",
            headers: {},
            body: validationError,
            size_bytes: 0,
            duration_ms: 0,
            timing: {
              total_ms: 0,
              dns_ms: null,
              connect_ms: null,
              ttfb_ms: null,
            },
            error: validationError,
          },
        }),
      );
      throw new Error(validationError);
    }

    const validationError = validateRequest(resolvedRequest);
    if (validationError) {
      dispatch(
        setResponse({
          tabId,
          response: {
            status: 0,
            status_text: "Validation Error",
            headers: {},
            body: validationError,
            size_bytes: 0,
            duration_ms: 0,
            timing: {
              total_ms: 0,
              dns_ms: null,
              connect_ms: null,
              ttfb_ms: null,
            },
            error: validationError,
          },
        }),
      );
      throw new Error(validationError);
    }

    dispatch(setLoading({ tabId, loading: true }));

    try {
      const response = await sendHttpRequest(
        request,
        {
          ignoreSsl: state.settings.ignoreSsl,
          timeoutMs: state.settings.timeoutMs,
        },
        variables,
      );

      dispatch(setResponse({ tabId, response }));

      dispatch(
        addHistory({
          request_id: request.id,
          method: request.method,
          url: request.url,
          status_code: response.status,
          duration_ms: response.duration_ms,
          response_size: response.size_bytes,
          request_snapshot_json: JSON.stringify(request),
          response_snapshot_json: JSON.stringify(response),
        }),
      );

      dispatch(
        updateTab({
          id: tabId,
          changes: { title: request.name || request.url || "Untitled Request" },
        }),
      );

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      dispatch(
        setResponse({
          tabId,
          response: {
            status: 0,
            status_text: "Error",
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
      throw error;
    }
  },
);
