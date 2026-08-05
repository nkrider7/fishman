import { createSelector, lruMemoize } from "@reduxjs/toolkit";
import type { Environment } from "@/types/environment";
import type { KeyValue } from "@/types/request";
import { findRootCollectionId } from "@/utils/collectionUtils";
import {
  buildVariableInfoMap,
  buildVariableMap,
  type VariableInfo,
} from "@/utils/variableSubstitution";
import type { RootState } from "../index";

export function getEffectiveVariables(
  env: Environment | undefined,
  liveVariablesByEnvId: Record<string, KeyValue[]>,
): KeyValue[] {
  if (!env) return [];
  return liveVariablesByEnvId[env.id] ?? env.variables;
}

/**
 * Memoized per collectionId. Without this, every useSelector call allocated a
 * fresh object + variable maps on *every* Redux action — including UI-only
 * actions that open menus/dialogs — forcing VariableAwareInput to re-render
 * across the entire request builder.
 */
export const selectActiveEnvironmentContext = createSelector(
  [
    (state: RootState) => state.environments,
    (state: RootState) => state.collections.folders,
    (_state: RootState, collectionId?: string | null) => collectionId ?? null,
  ],
  (environments, folders, collectionId) => {
    const {
      globalEnvironments,
      collectionEnvironments,
      activeGlobalEnvironmentId,
      activeCollectionEnvironmentIds,
      liveVariablesByEnvId,
    } = environments;

    const rootCollectionId = findRootCollectionId(collectionId, folders);

    const globalEnv = globalEnvironments.find(
      (e) => e.id === activeGlobalEnvironmentId,
    );
    const activeCollectionEnvId = rootCollectionId
      ? (activeCollectionEnvironmentIds[rootCollectionId] ?? null)
      : null;
    const collectionEnv = rootCollectionId
      ? collectionEnvironments[rootCollectionId]?.find(
          (e) => e.id === activeCollectionEnvId,
        )
      : undefined;

    const globalVariables = getEffectiveVariables(
      globalEnv,
      liveVariablesByEnvId,
    );
    const collectionVariables = getEffectiveVariables(
      collectionEnv,
      liveVariablesByEnvId,
    );

    const liveGlobal = Boolean(
      globalEnv && liveVariablesByEnvId[globalEnv.id],
    );
    const liveCollection = Boolean(
      collectionEnv && liveVariablesByEnvId[collectionEnv.id],
    );

    return {
      globalEnv,
      collectionEnv,
      globalVariables,
      collectionVariables,
      variables: buildVariableMap(globalVariables, collectionVariables),
      variableInfo: buildVariableInfoMap(globalVariables, collectionVariables),
      liveGlobal,
      liveCollection,
      rootCollectionId,
    };
  },
  {
    // Multiple VariableAwareInputs can target different collectionIds in one
    // tree; keep a small LRU so they don't thrash each other's cache.
    memoize: lruMemoize,
    memoizeOptions: { maxSize: 64 },
  },
);

export function resolveVariableInfo(
  name: string,
  variableInfo: Record<string, VariableInfo>,
  liveGlobal: boolean,
  liveCollection: boolean,
): (VariableInfo & { isLive: boolean }) | null {
  const info = variableInfo[name];
  if (!info) return null;
  const isLive =
    info.scope === "collection" ? liveCollection : liveGlobal;
  return { ...info, isLive };
}
