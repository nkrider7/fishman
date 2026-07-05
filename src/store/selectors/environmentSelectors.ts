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

export function selectActiveEnvironmentContext(
  state: RootState,
  collectionId?: string | null,
) {
  const {
    globalEnvironments,
    collectionEnvironments,
    activeGlobalEnvironmentId,
    activeCollectionEnvironmentIds,
    liveVariablesByEnvId,
  } = state.environments;

  const rootCollectionId = findRootCollectionId(
    collectionId,
    state.collections.folders,
  );

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

  const globalVariables = getEffectiveVariables(globalEnv, liveVariablesByEnvId);
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
}

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
