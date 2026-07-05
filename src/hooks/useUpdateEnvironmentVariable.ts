import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { useVariableContext } from "@/hooks/useVariableContext";
import { setLiveEnvironmentVariables } from "@/store/slices/environmentSlice";
import { getEffectiveVariables } from "@/store/selectors/environmentSelectors";
import type { Environment } from "@/types/environment";
import { createKeyValue } from "@/types/request";
import type { VariableScope } from "@/utils/variableSubstitution";

export interface VariableEditTarget {
  env: Environment;
  scope: VariableScope;
}

export function useUpdateEnvironmentVariable(collectionId?: string | null) {
  const dispatch = useAppDispatch();
  const liveVariablesByEnvId = useAppSelector(
    (s) => s.environments.liveVariablesByEnvId,
  );
  const { activeGlobalEnv, activeCollectionEnv, resolveVariable } =
    useVariableContext(collectionId);

  const getEditTarget = useCallback(
    (name: string): VariableEditTarget | null => {
      const info = resolveVariable(name);

      if (info?.scope === "collection" && activeCollectionEnv) {
        return { env: activeCollectionEnv, scope: "collection" };
      }
      if (info?.scope === "global" && activeGlobalEnv) {
        return { env: activeGlobalEnv, scope: "global" };
      }

      if (activeCollectionEnv) {
        return { env: activeCollectionEnv, scope: "collection" };
      }
      if (activeGlobalEnv) {
        return { env: activeGlobalEnv, scope: "global" };
      }

      return null;
    },
    [resolveVariable, activeCollectionEnv, activeGlobalEnv],
  );

  const updateVariable = useCallback(
    (name: string, value: string): boolean => {
      const target = getEditTarget(name);
      if (!target) return false;

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
    [dispatch, getEditTarget, liveVariablesByEnvId],
  );

  return {
    updateVariable,
    getEditTarget,
    canEdit: Boolean(activeGlobalEnv || activeCollectionEnv),
  };
}
