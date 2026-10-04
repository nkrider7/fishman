import type {
  DetectedVariable,
  EnvDetectConflictPolicy,
  MergeEnvResult,
} from "./types";

export interface ExistingEnvVariable {
  id?: string;
  key: string;
  value: string;
  enabled?: boolean;
  secret?: boolean;
}

/**
 * Merge accepted detection rows into an existing environment variable list.
 * Does not delete existing keys. Conflict policy controls overwrite vs skip.
 */
export function mergeDetectedIntoEnv(
  existing: ExistingEnvVariable[],
  accepted: DetectedVariable[],
  conflictPolicy: EnvDetectConflictPolicy = "skip",
): MergeEnvResult {
  const byKey = new Map<string, ExistingEnvVariable>();
  for (const row of existing) {
    if (!row.key) continue;
    byKey.set(row.key, { ...row });
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const det of accepted) {
    if (!det.key) continue;
    const prev = byKey.get(det.key);
    if (!prev) {
      byKey.set(det.key, {
        key: det.key,
        value: det.value,
        enabled: det.enabled,
        secret: det.secret || undefined,
      });
      added += 1;
      continue;
    }

    const sameValue = prev.value === det.value;
    const sameSecret = !!prev.secret === !!det.secret;
    if (sameValue && sameSecret) {
      skipped += 1;
      continue;
    }

    if (conflictPolicy === "skip" && prev.value !== "") {
      skipped += 1;
      continue;
    }

    byKey.set(det.key, {
      ...prev,
      value: det.value,
      enabled: det.enabled,
      secret: det.secret || prev.secret || undefined,
    });
    updated += 1;
  }

  return {
    variables: [...byKey.values()].map((v) => ({
      key: v.key,
      value: v.value,
      enabled: v.enabled ?? true,
      ...(v.id ? { id: v.id } : {}),
      ...(v.secret ? { secret: true as const } : {}),
    })),
    added,
    updated,
    skipped,
  };
}

/** True when env looks like the workspace-create stub (only default baseUrl). */
export function isStubLocalEnvironment(
  variables: ExistingEnvVariable[],
): boolean {
  const enabled = variables.filter((v) => v.enabled !== false && v.key);
  if (enabled.length === 0) return true;
  if (enabled.length > 1) return false;
  const only = enabled[0];
  return (
    only.key === "baseUrl" &&
    (only.value === "http://localhost:3000" ||
      only.value === "http://localhost:3000/")
  );
}
