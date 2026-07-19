import { useCallback, useMemo } from "react";
import { useAppSelector } from "@/hooks/redux";
import {
  resolveVariableInfo,
  selectActiveEnvironmentContext,
} from "@/store/selectors/environmentSelectors";
import {
  buildFolderChain,
  mergeFolderVariables,
} from "@/collections/inheritance";
import { resolveDynamicVariable } from "@/script-engine/builtins";
import type { VariableInfo } from "@/utils/variableSubstitution";

export function useVariableContext(collectionId?: string | null) {
  const context = useAppSelector((state) =>
    selectActiveEnvironmentContext(state, collectionId),
  );
  const folders = useAppSelector((state) => state.collections.folders);

  const folderVariables = useMemo(() => {
    if (!collectionId) return {} as Record<string, string>;
    return mergeFolderVariables(buildFolderChain(collectionId, folders));
  }, [collectionId, folders]);

  const resolveVariable = useCallback(
    (name: string): (VariableInfo & { isLive: boolean }) | null => {
      const info = resolveVariableInfo(
        name,
        context.variableInfo,
        context.liveGlobal,
        context.liveCollection,
      );
      if (info) return info;

      if (Object.prototype.hasOwnProperty.call(folderVariables, name)) {
        return {
          value: folderVariables[name],
          scope: "folder",
          isLive: false,
        };
      }

      const dynamic = resolveDynamicVariable(name);
      if (dynamic !== undefined) {
        return {
          value: dynamic,
          scope: "dynamic",
          isLive: false,
        };
      }

      return null;
    },
    [
      context.variableInfo,
      context.liveGlobal,
      context.liveCollection,
      folderVariables,
    ],
  );

  return useMemo(
    () => ({
      variables: context.variables,
      variableInfo: context.variableInfo,
      folderVariables,
      resolveVariable,
      rootCollectionId: context.rootCollectionId,
      activeGlobalEnv: context.globalEnv ?? null,
      activeCollectionEnv: context.collectionEnv ?? null,
    }),
    [context, folderVariables, resolveVariable],
  );
}
