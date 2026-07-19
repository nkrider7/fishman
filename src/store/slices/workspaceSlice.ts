import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { WorkspaceRecord } from "@/workspaces/types";
import { DEFAULT_WORKSPACE_ID } from "@/workspaces/constants";

interface WorkspaceState {
  workspaces: WorkspaceRecord[];
  activeWorkspaceId: string;
  loading: boolean;
  switching: boolean;
  error: string | null;
}

const initialState: WorkspaceState = {
  workspaces: [],
  activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  loading: false,
  switching: false,
  error: null,
};

const workspaceSlice = createSlice({
  name: "workspaces",
  initialState,
  reducers: {
    setWorkspaces(state, action: PayloadAction<WorkspaceRecord[]>) {
      state.workspaces = action.payload;
    },
    setActiveWorkspaceId(state, action: PayloadAction<string>) {
      state.activeWorkspaceId = action.payload;
    },
    setWorkspaceLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setWorkspaceSwitching(state, action: PayloadAction<boolean>) {
      state.switching = action.payload;
    },
    setWorkspaceError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    upsertWorkspace(state, action: PayloadAction<WorkspaceRecord>) {
      const idx = state.workspaces.findIndex((w) => w.id === action.payload.id);
      if (idx >= 0) {
        state.workspaces[idx] = action.payload;
      } else {
        state.workspaces.push(action.payload);
      }
    },
    removeWorkspace(state, action: PayloadAction<string>) {
      state.workspaces = state.workspaces.filter((w) => w.id !== action.payload);
    },
  },
});

export const {
  setWorkspaces,
  setActiveWorkspaceId,
  setWorkspaceLoading,
  setWorkspaceSwitching,
  setWorkspaceError,
  upsertWorkspace,
  removeWorkspace,
} = workspaceSlice.actions;

export default workspaceSlice.reducer;

export function selectActiveWorkspace(state: {
  workspaces: WorkspaceState;
}): WorkspaceRecord | undefined {
  return state.workspaces.workspaces.find(
    (w) => w.id === state.workspaces.activeWorkspaceId,
  );
}
