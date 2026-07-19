import type { RootState } from "../index";
import type { Environment } from "@/types/environment";
import type { KeyValue } from "@/types/request";
import { createKeyValue } from "@/types/request";
import type { VariableChange, VariableScope } from "@/script-engine/types";
import { getEffectiveVariables } from "@/store/selectors/environmentSelectors";
import {
  setLiveEnvironmentVariables,
  updateEnvironment,
} from "@/store/slices/environmentSlice";

const PERSISTABLE_SCOPES = new Set<VariableScope>([
  "environment",
  "global",
  "collection",
]);

type AppDispatch = (action: unknown) => unknown;

function upsertVariable(
  variables: KeyValue[],
  key: string,
  value: string,
): KeyValue[] {
  const existingIndex = variables.findIndex((v) => v.key === key);
  if (existingIndex >= 0) {
    return variables.map((item, index) =>
      index === existingIndex ? { ...item, value, enabled: true } : item,
    );
  }
  const entry = createKeyValue();
  entry.key = key;
  entry.value = value;
  return [...variables, entry];
}

function resolveTargetEnvironment(
  state: RootState,
  scope: VariableScope,
  rootCollectionId: string | null,
): Environment | null {
  const {
    globalEnvironments,
    collectionEnvironments,
    activeGlobalEnvironmentId,
    activeCollectionEnvironmentIds,
  } = state.environments;

  const globalEnv =
    globalEnvironments.find((e) => e.id === activeGlobalEnvironmentId) ?? null;
  const collectionEnv =
    rootCollectionId != null
      ? (collectionEnvironments[rootCollectionId]?.find(
          (e) => e.id === activeCollectionEnvironmentIds[rootCollectionId],
        ) ?? null)
      : null;

  if (scope === "global") return globalEnv;
  if (scope === "collection") return collectionEnv;
  // fm.environment.set — prefer collection env, fall back to global (active Development).
  if (scope === "environment") return collectionEnv ?? globalEnv;
  return null;
}

/**
 * Persist script variable mutations (fm.environment.set / globals / collectionVariables)
 * into the matching active environment so Manage Environments reflects them.
 */
export async function applyScriptVariableChanges(
  changes: VariableChange[] | undefined,
  rootCollectionId: string | null,
  getState: () => RootState,
  dispatch: AppDispatch,
): Promise<void> {
  if (!changes?.length) return;

  const persistable = changes.filter((c) => PERSISTABLE_SCOPES.has(c.scope));
  if (!persistable.length) return;

  // Latest write wins per env+key.
  const byEnv = new Map<string, { env: Environment; updates: Map<string, string> }>();

  for (const change of persistable) {
    const state = getState();
    const env = resolveTargetEnvironment(state, change.scope, rootCollectionId);
    if (!env) continue;

    let bucket = byEnv.get(env.id);
    if (!bucket) {
      bucket = { env, updates: new Map() };
      byEnv.set(env.id, bucket);
    }
    bucket.updates.set(change.key, change.value);
  }

  for (const { env, updates } of byEnv.values()) {
    const state = getState();
    let next = getEffectiveVariables(env, state.environments.liveVariablesByEnvId);
    for (const [key, value] of updates) {
      next = upsertVariable(next, key, value);
    }

    dispatch(
      setLiveEnvironmentVariables({
        envId: env.id,
        variables: next,
      }),
    );

    await dispatch(
      updateEnvironment({
        id: env.id,
        variables: next,
      }),
    );
  }
}
