import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ApiTestConfig,
  ApiTestRunSnapshot,
  ApiTestView,
  ResultsTab,
} from "@/api-testing";
import { defaultApiTestConfig, emptyMetrics } from "@/api-testing";

interface ApiTestingState {
  view: ApiTestView;
  resultsTab: ResultsTab;
  config: ApiTestConfig;
  run: ApiTestRunSnapshot;
  /** True while engine loop is active. */
  running: boolean;
  lastError: string | null;
}

const idleRun = (): ApiTestRunSnapshot => ({
  phase: "idle",
  startedAt: null,
  elapsedMs: 0,
  progressPct: 0,
  currentVus: 0,
  metrics: emptyMetrics(),
  timeline: [],
  errors: [],
  breakingPoint: null,
  spikePhase: null,
});

const initialState: ApiTestingState = {
  view: "config",
  resultsTab: "summary",
  config: defaultApiTestConfig(),
  run: idleRun(),
  running: false,
  lastError: null,
};

const apiTestingSlice = createSlice({
  name: "apiTesting",
  initialState,
  reducers: {
    setApiTestingView: (state, action: PayloadAction<ApiTestView>) => {
      state.view = action.payload;
    },
    setApiTestingResultsTab: (state, action: PayloadAction<ResultsTab>) => {
      state.resultsTab = action.payload;
    },
    patchApiTestingConfig: (
      state,
      action: PayloadAction<Partial<ApiTestConfig>>,
    ) => {
      Object.assign(state.config, action.payload);
    },
    replaceApiTestingConfig: (state, action: PayloadAction<ApiTestConfig>) => {
      state.config = action.payload;
    },
    setApiTestingRunSnapshot: (
      state,
      action: PayloadAction<ApiTestRunSnapshot>,
    ) => {
      state.run = action.payload;
      state.running =
        action.payload.phase === "running" ||
        (action.payload.phase === "idle" && false);
      if (action.payload.phase === "running") {
        state.running = true;
        state.view = "results";
      } else if (
        action.payload.phase === "completed" ||
        action.payload.phase === "cancelled" ||
        action.payload.phase === "failed"
      ) {
        state.running = false;
        state.view = "results";
      }
    },
    setApiTestingRunning: (state, action: PayloadAction<boolean>) => {
      state.running = action.payload;
    },
    setApiTestingError: (state, action: PayloadAction<string | null>) => {
      state.lastError = action.payload;
    },
    resetApiTestingRun: (state) => {
      state.run = idleRun();
      state.running = false;
      state.view = "config";
      state.lastError = null;
    },
    backToApiTestingConfig: (state) => {
      state.view = "config";
      state.running = false;
    },
  },
});

export const {
  setApiTestingView,
  setApiTestingResultsTab,
  patchApiTestingConfig,
  replaceApiTestingConfig,
  setApiTestingRunSnapshot,
  setApiTestingRunning,
  setApiTestingError,
  resetApiTestingRun,
  backToApiTestingConfig,
} = apiTestingSlice.actions;

export default apiTestingSlice.reducer;
