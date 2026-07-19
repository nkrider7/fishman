import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  RunnerConfig,
  RunnerItemResult,
  RunnerPhase,
  RunnerQueueItem,
  RunnerResultFilter,
} from "@/runner/types";
import { DEFAULT_RUNNER_CONFIG } from "@/runner/types";

export interface RunnerState {
  phase: RunnerPhase;
  config: RunnerConfig | null;
  queue: RunnerQueueItem[];
  selectedRequestIds: string[];
  results: RunnerItemResult[];
  activeResultId: string | null;
  filter: RunnerResultFilter;
  startedAt?: number;
  finishedAt?: number;
  runId?: string;
  error?: string;
  /** Maps tab id → whether that tab is showing this runner session */
  tabId: string | null;
}

const initialState: RunnerState = {
  phase: "idle",
  config: null,
  queue: [],
  selectedRequestIds: [],
  results: [],
  activeResultId: null,
  filter: "all",
  tabId: null,
};

const runnerSlice = createSlice({
  name: "runner",
  initialState,
  reducers: {
    openRunnerSession: (
      state,
      action: PayloadAction<{
        tabId: string;
        collectionId: string;
        folderId: string | null;
        collectionName: string;
        queue: RunnerQueueItem[];
      }>,
    ) => {
      const { tabId, collectionId, folderId, collectionName, queue } =
        action.payload;
      state.phase = "configuring";
      state.tabId = tabId;
      state.config = {
        ...DEFAULT_RUNNER_CONFIG,
        collectionId,
        folderId,
        collectionName,
      };
      state.queue = queue;
      state.selectedRequestIds = queue.map((q) => q.requestId);
      state.results = [];
      state.activeResultId = null;
      state.filter = "all";
      state.startedAt = undefined;
      state.finishedAt = undefined;
      state.runId = undefined;
      state.error = undefined;
    },
    patchRunnerConfig: (
      state,
      action: PayloadAction<Partial<RunnerConfig>>,
    ) => {
      if (!state.config) return;
      state.config = { ...state.config, ...action.payload };
    },
    setSelectedRequestIds: (state, action: PayloadAction<string[]>) => {
      state.selectedRequestIds = action.payload;
    },
    toggleRequestSelected: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      if (state.selectedRequestIds.includes(id)) {
        state.selectedRequestIds = state.selectedRequestIds.filter(
          (x) => x !== id,
        );
      } else {
        state.selectedRequestIds.push(id);
      }
    },
    selectAllRequests: (state) => {
      state.selectedRequestIds = state.queue.map((q) => q.requestId);
    },
    deselectAllRequests: (state) => {
      state.selectedRequestIds = [];
    },
    reorderSelectedQueue: (state, action: PayloadAction<string[]>) => {
      // Reorder full queue to match new id order (selected + unselected kept).
      const order = action.payload;
      const byId = new Map(state.queue.map((q) => [q.requestId, q]));
      const next: RunnerQueueItem[] = [];
      for (const id of order) {
        const item = byId.get(id);
        if (item) {
          next.push(item);
          byId.delete(id);
        }
      }
      for (const item of byId.values()) next.push(item);
      state.queue = next;
      state.selectedRequestIds = state.selectedRequestIds
        .slice()
        .sort((a, b) => order.indexOf(a) - order.indexOf(b));
    },
    resetRunnerConfig: (state) => {
      if (!state.config) return;
      const { collectionId, folderId, collectionName } = state.config;
      state.config = {
        ...DEFAULT_RUNNER_CONFIG,
        collectionId,
        folderId,
        collectionName,
      };
      state.selectedRequestIds = state.queue.map((q) => q.requestId);
      state.results = [];
      state.activeResultId = null;
      state.filter = "all";
      state.phase = "configuring";
      state.error = undefined;
    },
    runnerRunStarted: (
      state,
      action: PayloadAction<{ runId: string; startedAt: number }>,
    ) => {
      state.phase = "running";
      state.runId = action.payload.runId;
      state.startedAt = action.payload.startedAt;
      state.finishedAt = undefined;
      state.results = [];
      state.activeResultId = null;
      state.error = undefined;
    },
    runnerItemUpsert: (state, action: PayloadAction<RunnerItemResult>) => {
      const idx = state.results.findIndex((r) => r.id === action.payload.id);
      if (idx >= 0) {
        state.results[idx] = action.payload;
      } else {
        state.results.push(action.payload);
      }
      if (
        !state.activeResultId ||
        action.payload.status === "failed" ||
        action.payload.status === "running"
      ) {
        state.activeResultId = action.payload.id;
      }
    },
    runnerRunFinished: (
      state,
      action: PayloadAction<{
        finishedAt: number;
        cancelled: boolean;
        error?: string;
      }>,
    ) => {
      state.phase = action.payload.cancelled ? "cancelled" : "completed";
      state.finishedAt = action.payload.finishedAt;
      state.error = action.payload.error;
    },
    setRunnerFilter: (state, action: PayloadAction<RunnerResultFilter>) => {
      state.filter = action.payload;
    },
    setActiveResultId: (state, action: PayloadAction<string | null>) => {
      state.activeResultId = action.payload;
    },
    clearRunnerResults: (state) => {
      state.results = [];
      state.activeResultId = null;
      state.phase = "configuring";
      state.startedAt = undefined;
      state.finishedAt = undefined;
      state.runId = undefined;
      state.error = undefined;
    },
    closeRunnerSession: (state) => {
      Object.assign(state, initialState);
    },
    refreshRunnerQueue: (
      state,
      action: PayloadAction<{ queue: RunnerQueueItem[] }>,
    ) => {
      const prevSelected = new Set(state.selectedRequestIds);
      const prevIds = new Set(state.queue.map((q) => q.requestId));
      // Preserve user reorder: keep existing relative order, update fields,
      // drop removed ids, append newly discovered ids in tree order.
      const nextById = new Map(
        action.payload.queue.map((q) => [q.requestId, q]),
      );
      const merged: RunnerQueueItem[] = [];
      for (const item of state.queue) {
        const fresh = nextById.get(item.requestId);
        if (fresh) {
          merged.push(fresh);
          nextById.delete(item.requestId);
        }
      }
      for (const item of action.payload.queue) {
        if (nextById.has(item.requestId)) {
          merged.push(item);
          nextById.delete(item.requestId);
        }
      }
      state.queue = merged;

      const selected = merged
        .filter(
          (q) =>
            prevSelected.has(q.requestId) || !prevIds.has(q.requestId),
        )
        .map((q) => q.requestId);

      state.selectedRequestIds =
        selected.length > 0
          ? selected
          : merged.map((q) => q.requestId);
    },
  },
});

export const {
  openRunnerSession,
  patchRunnerConfig,
  setSelectedRequestIds,
  toggleRequestSelected,
  selectAllRequests,
  deselectAllRequests,
  reorderSelectedQueue,
  resetRunnerConfig,
  runnerRunStarted,
  runnerItemUpsert,
  runnerRunFinished,
  setRunnerFilter,
  setActiveResultId,
  clearRunnerResults,
  closeRunnerSession,
  refreshRunnerQueue,
} = runnerSlice.actions;

export default runnerSlice.reducer;
