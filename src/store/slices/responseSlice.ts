import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ApiResponse } from "@/types/response";

interface ResponseState {
  responses: Record<string, ApiResponse | null>;
  loading: Record<string, boolean>;
}

const initialState: ResponseState = {
  responses: {},
  loading: {},
};

const responseSlice = createSlice({
  name: "response",
  initialState,
  reducers: {
    setLoading: (
      state,
      action: PayloadAction<{ tabId: string; loading: boolean }>,
    ) => {
      state.loading[action.payload.tabId] = action.payload.loading;
    },
    setResponse: (
      state,
      action: PayloadAction<{ tabId: string; response: ApiResponse | null }>,
    ) => {
      state.responses[action.payload.tabId] = action.payload.response;
      state.loading[action.payload.tabId] = false;
    },
    clearResponse: (state, action: PayloadAction<string>) => {
      delete state.responses[action.payload];
      delete state.loading[action.payload];
    },
    replaceResponses: (
      state,
      action: PayloadAction<Record<string, ApiResponse | null>>,
    ) => {
      state.responses = action.payload;
      state.loading = {};
    },
  },
});

export const { setLoading, setResponse, clearResponse, replaceResponses } =
  responseSlice.actions;
export default responseSlice.reducer;
