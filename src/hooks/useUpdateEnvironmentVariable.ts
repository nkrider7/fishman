import { useCallback, useMemo } from "react";
import { useStore } from "react-redux";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { useVariableContext } from "@/hooks/useVariableContext";
import {
  createEnvironment,
  setActiveCollectionEnvironment,
  setActiveGlobalEnvironment,
  setLiveEnvironmentVariables,
} from "@/store/slices/environmentSlice";
import { getEffectiveVariables } from "@/store/selectors/environmentSelectors";
import type { RootState } from "@/store";
import type { Environment } from "@/types/environment";
import { createKeyValue } from "@/types/request";

export interface VariableEditTarget {
  env: Environment;
  scope: "global" | "collection";
}

const DEFAULT_ENV_NAME = "Default";

export function useUpdateEnvironmentVariable(collectionId?: string | null) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const globalEnvironments = useAppSelector(
    (s) => s.environments.globalEnvironments,
  );
  const collectionEnvironments = useAppSelector(
    (s) => s.environments.collectionEnvironments,
  );
  const activeGlobalEnvironmentId = useAppSelector(
    (s) => s.environments.activeGlobalEnvironmentId,
  );
  const activeCollectionEnvironmentIds = useAppSelector(
    (s) => s.environments.activeCollectionEnvironmentIds,
  );

  const {
    activeGlobalEnv,
    activeCollectionEnv,
    resolveVariable,
    rootCollectionId,
  } = useVariableContext(collectionId);

  /** Prefer active envs; otherwise first available so unresolved vars can still be created. */
  const preferredTarget = useMemo((): VariableEditTarget | null => {
    if (activeCollectionEnv) {
      return { env: activeCollectionEnv, scope: "collection" };
    }
    if (activeGlobalEnv) {
      return { env: activeGlobalEnv, scope: "global" };
    }

    if (rootCollectionId) {
      const list = collectionEnvironments[rootCollectionId] ?? [];
      if (list[0]) return { env: list[0], scope: "collection" };
    }

    if (globalEnvironments[0]) {
      return { env: globalEnvironments[0], scope: "global" };
    }

    return null;
  }, [
    activeCollectionEnv,
    activeGlobalEnv,
    rootCollectionId,
    collectionEnvironments,
    globalEnvironments,
  ]);

  const getEditTarget = useCallback(
    (name: string): VariableEditTarget | null => {
      const info = resolveVariable(name);

      if (info?.scope === "dynamic" || info?.scope === "folder") {
        return null;
      }

      if (info?.scope === "collection" && activeCollectionEnv) {
        return { env: activeCollectionEnv, scope: "collection" };
      }
      if (info?.scope === "global" && activeGlobalEnv) {
        return { env: activeGlobalEnv, scope: "global" };
      }

      return preferredTarget;
    },
    [resolveVariable, activeCollectionEnv, activeGlobalEnv, preferredTarget],
  );

  const ensureTargetActive = useCallback(
    async (target: VariableEditTarget) => {
      if (target.scope === "global") {
        if (activeGlobalEnvironmentId !== target.env.id) {
          await dispatch(setActiveGlobalEnvironment(target.env.id));
        }
        return;
      }

      const rootId = rootCollectionId ?? target.env.collection_id;
      if (!rootId) return;
      if (activeCollectionEnvironmentIds[rootId] !== target.env.id) {
        await dispatch(
          setActiveCollectionEnvironment({
            collectionId: rootId,
            environmentId: target.env.id,
          }),
        );
      }
    },
    [
      dispatch,
      activeGlobalEnvironmentId,
      activeCollectionEnvironmentIds,
      rootCollectionId,
    ],
  );

  const createDefaultTarget =
    useCallback(async (): Promise<VariableEditTarget | null> => {
      const collectionIdForEnv = rootCollectionId ?? null;
      const result = await dispatch(
        createEnvironment({
          name: DEFAULT_ENV_NAME,
          variables: [],
          collectionId: collectionIdForEnv,
        }),
      );

      if (createEnvironment.fulfilled.match(result)) {
        const env = result.payload;
        return {
          env,
          scope: env.collection_id ? "collection" : "global",
        };
      }

      // Name conflict or race — pick whatever exists now in the preferred scope.
      const state = store.getState().environments;
      if (collectionIdForEnv) {
        const list = state.collectionEnvironments[collectionIdForEnv] ?? [];
        const existing =
          list.find((e) => e.name === DEFAULT_ENV_NAME) ?? list[0];
        if (existing) return { env: existing, scope: "collection" };
      }
      const globalExisting =
        state.globalEnvironments.find((e) => e.name === DEFAULT_ENV_NAME) ??
        state.globalEnvironments[0];
      if (globalExisting) return { env: globalExisting, scope: "global" };

      return null;
    }, [dispatch, rootCollectionId, store]);

  const updateVariable = useCallback(
    async (name: string, value: string): Promise<boolean> => {
      let target = getEditTarget(name);
      if (!target) {
        target = await createDefaultTarget();
      }
      if (!target) return false;

      await ensureTargetActive(target);

      const liveMap = store.getState().environments.liveVariablesByEnvId;
      const variables = getEffectiveVariables(target.env, liveMap);
      const existingIndex = variables.findIndex((v) => v.key === name);

      let next;
      if (existingIndex >= 0) {
        next = variables.map((item, index) =>
          index === existingIndex
            ? { ...item, value, enabled: true }
            : item,
        );
      } else {
        const entry = createKeyValue();
        entry.key = name;
        entry.value = value;
        next = [...variables, entry];
      }

      dispatch(
        setLiveEnvironmentVariables({
          envId: target.env.id,
          variables: next,
        }),
      );
      return true;
    },
    [
      dispatch,
      getEditTarget,
      createDefaultTarget,
      ensureTargetActive,
      store,
    ],
  );

  return {
    updateVariable,
    getEditTarget,
    /** True when an env already exists, or when we can auto-create one. */
    canEdit: true,
    willCreateEnvironment: !preferredTarget,
    preferredTarget,
  };
}
