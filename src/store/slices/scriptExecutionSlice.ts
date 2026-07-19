import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ScriptExecutionResult,
  ScriptLogEntry,
  ScriptPipelineResult,
  ScriptTestResult,
} from "@/script-engine/types";

export interface TabScriptExecutionState {
  logs: ScriptLogEntry[];
  preRequest?: ScriptExecutionResult;
  postResponse?: ScriptExecutionResult;
  tests?: ScriptExecutionResult;
  pipeline?: ScriptPipelineResult;
  testResults: ScriptTestResult[];
  running: boolean;
}

interface ScriptExecutionState {
  byTab: Record<string, TabScriptExecutionState>;
}

const emptyTabState = (): TabScriptExecutionState => ({
  logs: [],
  testResults: [],
  running: false,
});

const initialState: ScriptExecutionState = {
  byTab: {},
};

const scriptExecutionSlice = createSlice({
  name: "scriptExecution",
  initialState,
  reducers: {
    setScriptRunning: (
      state,
      action: PayloadAction<{ tabId: string; running: boolean }>,
    ) => {
      const tab = state.byTab[action.payload.tabId] ?? emptyTabState();
      tab.running = action.payload.running;
      state.byTab[action.payload.tabId] = tab;
    },
    appendScriptLog: (
      state,
      action: PayloadAction<{ tabId: string; entry: ScriptLogEntry }>,
    ) => {
      const tab = state.byTab[action.payload.tabId] ?? emptyTabState();
      tab.logs.push(action.payload.entry);
      state.byTab[action.payload.tabId] = tab;
    },
    setScriptPipelineResult: (
      state,
      action: PayloadAction<{ tabId: string; result: ScriptPipelineResult }>,
    ) => {
      const { tabId, result } = action.payload;
      const tab = state.byTab[tabId] ?? emptyTabState();
      tab.pipeline = result;
      tab.preRequest = result.preRequest;
      tab.postResponse = result.postResponse;
      tab.tests = result.tests;
      tab.testResults = [
        ...(result.preRequest?.tests ?? []),
        ...(result.postResponse?.tests ?? []),
        ...(result.tests?.tests ?? []),
      ];
      tab.logs = [
        ...(result.preRequest?.logs ?? []),
        ...(result.postResponse?.logs ?? []),
        ...(result.tests?.logs ?? []),
      ];
      tab.running = false;
      state.byTab[tabId] = tab;
    },
    clearScriptExecution: (state, action: PayloadAction<string>) => {
      delete state.byTab[action.payload];
    },
    clearAllScriptExecutions: (state) => {
      state.byTab = {};
    },
  },
});

export const {
  setScriptRunning,
  appendScriptLog,
  setScriptPipelineResult,
  clearScriptExecution,
  clearAllScriptExecutions,
} = scriptExecutionSlice.actions;

export default scriptExecutionSlice.reducer;
