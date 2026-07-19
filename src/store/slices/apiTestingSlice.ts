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
  /**
   * True while a run is active (running or draining after stop).
   * Derived from snapshots in setApiTestingRunSnapshot; thunks may set it
   * optimistically on start / clear on abort completion.
   */
  running: boolean;
  lastError: string | null;
}

export const idleRun = (): ApiTestRunSnapshot => ({
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

function isActivePhase(phase: ApiTestRunSnapshot["phase"]): boolean {
  return phase === "running" || phase === "stopping";
}

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
      state.running = isActivePhase(action.payload.phase);
      if (isActivePhase(action.payload.phase)) {
        state.view = "results";
      } else if (
        action.payload.phase === "completed" ||
        action.payload.phase === "cancelled" ||
        action.payload.phase === "failed"
      ) {
        state.view = "results";
      }
    },
    /** Optimistic start before first engine tick. */
    beginApiTestingRun: (state) => {
      state.lastError = null;
      state.running = true;
      state.view = "results";
      state.resultsTab = "summary";
      state.run = {
        ...idleRun(),
        phase: "running",
        startedAt: Date.now(),
      };
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
      // Never leave a live run behind — caller must abort first.
      if (state.running) return;
      state.view = "config";
      state.lastError = null;
    },
  },
});

export const {
  setApiTestingView,
  setApiTestingResultsTab,
  patchApiTestingConfig,
  replaceApiTestingConfig,
  setApiTestingRunSnapshot,
  beginApiTestingRun,
  setApiTestingRunning,
  setApiTestingError,
  resetApiTestingRun,
  backToApiTestingConfig,
} = apiTestingSlice.actions;

export default apiTestingSlice.reducer;
