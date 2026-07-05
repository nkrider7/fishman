import { useCallback, useMemo } from "react";
import { useAppSelector } from "@/hooks/redux";
import {
  resolveVariableInfo,
  selectActiveEnvironmentContext,
} from "@/store/selectors/environmentSelectors";
import type { VariableInfo } from "@/utils/variableSubstitution";

export function useVariableContext(collectionId?: string | null) {
  const context = useAppSelector((state) =>
    selectActiveEnvironmentContext(state, collectionId),
  );

  const resolveVariable = useCallback(
    (name: string): (VariableInfo & { isLive: boolean }) | null =>
      resolveVariableInfo(
        name,
        context.variableInfo,
        context.liveGlobal,
        context.liveCollection,
      ),
    [context.variableInfo, context.liveGlobal, context.liveCollection],
  );

  return useMemo(
    () => ({
      variables: context.variables,
      variableInfo: context.variableInfo,
      resolveVariable,
      rootCollectionId: context.rootCollectionId,
      activeGlobalEnv: context.globalEnv ?? null,
      activeCollectionEnv: context.collectionEnv ?? null,
    }),
    [context, resolveVariable],
  );
}
