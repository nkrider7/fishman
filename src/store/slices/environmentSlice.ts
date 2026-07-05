import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Environment, EnvironmentScope } from "@/types/environment";
import type { KeyValue } from "@/types/request";
import * as envService from "@/services/environmentService";
import { getSettings, saveSettings } from "@/services/dbService";
import type { RootState } from "../index";
import { selectActiveEnvironmentContext } from "../selectors/environmentSelectors";

interface EnvironmentState {
  globalEnvironments: Environment[];
  collectionEnvironments: Record<string, Environment[]>;
  activeGlobalEnvironmentId: string | null;
  activeCollectionEnvironmentIds: Record<string, string | null>;
  selectedEnvironmentId: string | null;
  managerScope: EnvironmentScope;
  managerCollectionId: string | null;
  /** Unsaved variable edits keyed by environment id — used for live URL preview */
  liveVariablesByEnvId: Record<string, KeyValue[]>;
  loading: boolean;
  dirty: boolean;
}

const initialState: EnvironmentState = {
  globalEnvironments: [],
  collectionEnvironments: {},
  activeGlobalEnvironmentId: null,
  activeCollectionEnvironmentIds: {},
  selectedEnvironmentId: null,
  managerScope: "global",
  managerCollectionId: null,
  liveVariablesByEnvId: {},
  loading: false,
  dirty: false,
};

export const fetchEnvironments = createAsyncThunk(
  "environments/fetch",
  async () => {
    const [environments, settings] = await Promise.all([
      envService.listAllEnvironments(),
      getSettings(),
    ]);
    return { environments, settings };
  },
);

export const createEnvironment = createAsyncThunk(
  "environments/create",
  async ({
    name,
    variables,
    collectionId,
  }: {
    name: string;
    variables?: KeyValue[];
    collectionId?: string | null;
  }) => {
    return envService.createEnvironment({
      name,
      variables: variables ?? [],
      collectionId: collectionId ?? null,
    });
  },
);

export const updateEnvironment = createAsyncThunk(
  "environments/update",
  async ({
    id,
    name,
    variables,
  }: {
    id: string;
    name?: string;
    variables?: KeyValue[];
  }) => {
    return envService.updateEnvironment(id, { name, variables });
  },
);

export const deleteEnvironment = createAsyncThunk(
  "environments/delete",
  async (id: string) => {
    await envService.deleteEnvironment(id);
    const settings = await getSettings();
    let changed = false;

    if (settings.activeGlobalEnvironmentId === id) {
      settings.activeGlobalEnvironmentId = null;
      changed = true;
    }
    for (const [collectionId, envId] of Object.entries(
      settings.activeCollectionEnvironmentIds,
    )) {
      if (envId === id) {
        settings.activeCollectionEnvironmentIds[collectionId] = null;
        changed = true;
      }
    }
    if (changed) await saveSettings(settings);

    return { id, settings: changed ? settings : null };
  },
);

export const duplicateEnvironment = createAsyncThunk(
  "environments/duplicate",
  async (id: string) => envService.duplicateEnvironment(id),
);

export const setActiveGlobalEnvironment = createAsyncThunk(
  "environments/setActiveGlobal",
  async (environmentId: string | null) => {
    const settings = await getSettings();
    settings.activeGlobalEnvironmentId = environmentId;
    await saveSettings(settings);
    return settings;
  },
);

export const setActiveCollectionEnvironment = createAsyncThunk(
  "environments/setActiveCollection",
  async ({
    collectionId,
    environmentId,
  }: {
    collectionId: string;
    environmentId: string | null;
  }) => {
    const settings = await getSettings();
    settings.activeCollectionEnvironmentIds = {
      ...settings.activeCollectionEnvironmentIds,
      [collectionId]: environmentId,
    };
    await saveSettings(settings);
    return settings;
  },
);

function groupEnvironments(environments: Environment[]) {
  const globalEnvironments = environments.filter((e) => !e.collection_id);
  const collectionEnvironments: Record<string, Environment[]> = {};
  for (const env of environments) {
    if (!env.collection_id) continue;
    const list = collectionEnvironments[env.collection_id] ?? [];
    list.push(env);
    collectionEnvironments[env.collection_id] = list;
  }
  return { globalEnvironments, collectionEnvironments };
}

export function selectResolvedVariables(state: RootState, collectionId?: string | null) {
  return selectActiveEnvironmentContext(state, collectionId).variables;
}

const environmentSlice = createSlice({
  name: "environments",
  initialState,
  reducers: {
    setSelectedEnvironmentId(state, action: PayloadAction<string | null>) {
      state.selectedEnvironmentId = action.payload;
      state.dirty = false;
    },
    setManagerScope(
      state,
      action: PayloadAction<{ scope: EnvironmentScope; collectionId?: string | null }>,
    ) {
      state.managerScope = action.payload.scope;
      state.managerCollectionId = action.payload.collectionId ?? null;
      state.selectedEnvironmentId = null;
      state.dirty = false;
    },
    setEnvironmentDirty(state, action: PayloadAction<boolean>) {
      state.dirty = action.payload;
    },
    setLiveEnvironmentVariables(
      state,
      action: PayloadAction<{ envId: string; variables: KeyValue[] }>,
    ) {
      state.liveVariablesByEnvId[action.payload.envId] = action.payload.variables;
    },
    clearLiveEnvironmentVariables(state, action: PayloadAction<string>) {
      delete state.liveVariablesByEnvId[action.payload];
    },
    syncActiveFromSettings(
      state,
      action: PayloadAction<{
        activeGlobalEnvironmentId: string | null;
        activeCollectionEnvironmentIds: Record<string, string | null>;
      }>,
    ) {
      state.activeGlobalEnvironmentId = action.payload.activeGlobalEnvironmentId;
      state.activeCollectionEnvironmentIds =
        action.payload.activeCollectionEnvironmentIds;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnvironments.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchEnvironments.fulfilled, (state, action) => {
        const grouped = groupEnvironments(action.payload.environments);
        state.globalEnvironments = grouped.globalEnvironments;
        state.collectionEnvironments = grouped.collectionEnvironments;
        state.activeGlobalEnvironmentId =
          action.payload.settings.activeGlobalEnvironmentId;
        state.activeCollectionEnvironmentIds =
          action.payload.settings.activeCollectionEnvironmentIds;
        state.loading = false;
      })
      .addCase(fetchEnvironments.rejected, (state) => {
        state.loading = false;
      })
      .addCase(createEnvironment.fulfilled, (state, action) => {
        const env = action.payload;
        if (env.collection_id) {
          const list = state.collectionEnvironments[env.collection_id] ?? [];
          state.collectionEnvironments[env.collection_id] = [...list, env];
        } else {
          state.globalEnvironments.push(env);
        }
        state.selectedEnvironmentId = env.id;
        state.dirty = false;
      })
      .addCase(updateEnvironment.fulfilled, (state, action) => {
        const env = action.payload;
        if (env.collection_id) {
          const list = state.collectionEnvironments[env.collection_id] ?? [];
          state.collectionEnvironments[env.collection_id] = list.map((e) =>
            e.id === env.id ? env : e,
          );
        } else {
          state.globalEnvironments = state.globalEnvironments.map((e) =>
            e.id === env.id ? env : e,
          );
        }
        delete state.liveVariablesByEnvId[env.id];
        state.dirty = false;
      })
      .addCase(deleteEnvironment.fulfilled, (state, action) => {
        const { id, settings } = action.payload;
        state.globalEnvironments = state.globalEnvironments.filter((e) => e.id !== id);
        for (const key of Object.keys(state.collectionEnvironments)) {
          state.collectionEnvironments[key] = state.collectionEnvironments[key].filter(
            (e) => e.id !== id,
          );
        }
        delete state.liveVariablesByEnvId[id];
        if (state.selectedEnvironmentId === id) {
          state.selectedEnvironmentId = null;
        }
        if (settings) {
          state.activeGlobalEnvironmentId = settings.activeGlobalEnvironmentId;
          state.activeCollectionEnvironmentIds =
            settings.activeCollectionEnvironmentIds;
        }
        state.dirty = false;
      })
      .addCase(duplicateEnvironment.fulfilled, (state, action) => {
        const env = action.payload;
        if (env.collection_id) {
          const list = state.collectionEnvironments[env.collection_id] ?? [];
          state.collectionEnvironments[env.collection_id] = [...list, env];
        } else {
          state.globalEnvironments.push(env);
        }
        state.selectedEnvironmentId = env.id;
        state.dirty = false;
      })
      .addCase(setActiveGlobalEnvironment.fulfilled, (state, action) => {
        state.activeGlobalEnvironmentId = action.payload.activeGlobalEnvironmentId;
      })
      .addCase(setActiveCollectionEnvironment.fulfilled, (state, action) => {
        state.activeGlobalEnvironmentId = action.payload.activeGlobalEnvironmentId;
        state.activeCollectionEnvironmentIds =
          action.payload.activeCollectionEnvironmentIds;
      });
  },
});

export const {
  setSelectedEnvironmentId,
  setManagerScope,
  setEnvironmentDirty,
  setLiveEnvironmentVariables,
  clearLiveEnvironmentVariables,
  syncActiveFromSettings,
} = environmentSlice.actions;

export default environmentSlice.reducer;
