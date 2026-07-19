import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { useVariableContext } from "@/hooks/useVariableContext";
import {
  setActiveCollectionEnvironment,
  setActiveGlobalEnvironment,
  setLiveEnvironmentVariables,
} from "@/store/slices/environmentSlice";
import { getEffectiveVariables } from "@/store/selectors/environmentSelectors";
import type { Environment } from "@/types/environment";
import { createKeyValue } from "@/types/request";

export interface VariableEditTarget {
  env: Environment;
  scope: "global" | "collection";
}

export function useUpdateEnvironmentVariable(collectionId?: string | null) {
  const dispatch = useAppDispatch();
  const liveVariablesByEnvId = useAppSelector(
    (s) => s.environments.liveVariablesByEnvId,
  );
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
    (target: VariableEditTarget) => {
      if (target.scope === "global") {
        if (activeGlobalEnvironmentId !== target.env.id) {
          void dispatch(setActiveGlobalEnvironment(target.env.id));
        }
        return;
      }

      const rootId = rootCollectionId ?? target.env.collection_id;
      if (!rootId) return;
      if (activeCollectionEnvironmentIds[rootId] !== target.env.id) {
        void dispatch(
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

  const updateVariable = useCallback(
    (name: string, value: string): boolean => {
      const target = getEditTarget(name);
      if (!target) return false;

      ensureTargetActive(target);

      const variables = getEffectiveVariables(
        target.env,
        liveVariablesByEnvId,
      );
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
    [dispatch, getEditTarget, ensureTargetActive, liveVariablesByEnvId],
  );

  return {
    updateVariable,
    getEditTarget,
    canEdit: Boolean(preferredTarget),
  };
}
