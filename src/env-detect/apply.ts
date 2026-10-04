import {
  createUid,
  ENVIRONMENTS_DIR,
  parseWorkspaceDir,
  writeEnvironment,
  type FishEnvironmentNode,
  type FishKeyValue,
  type GitNativeFs,
} from "@/git-native";
import { mergeDetectedIntoEnv } from "./merge";
import type {
  DetectedVariable,
  EnvDetectConflictPolicy,
  EnvDetectReport,
} from "./types";

export interface ApplyEnvDetectResult {
  envName: string;
  envId: string;
  relativePath: string;
  secretsRelativePath?: string;
  added: number;
  updated: number;
  skipped: number;
  /** Merged variables (secrets included — for SQLite mirror). */
  variables: FishKeyValue[];
}

export interface ApplyEnvDetectOptions {
  fs: GitNativeFs;
  /** Absolute path to fishman workspace root (…/fishman). */
  workspaceRootPath: string;
  report: EnvDetectReport;
  envName: string;
  acceptedIds: string[];
  conflictPolicy?: EnvDetectConflictPolicy;
}

/**
 * Merge accepted detections into a Fishman environment on disk
 * (`environments/<name>.json` + optional `<name>.secret.json`).
 */
export async function applyEnvDetectToWorkspace(
  options: ApplyEnvDetectOptions,
): Promise<ApplyEnvDetectResult> {
  const {
    fs,
    workspaceRootPath,
    report,
    envName,
    acceptedIds,
    conflictPolicy = "skip",
  } = options;

  const accepted = report.variables.filter((v) => acceptedIds.includes(v.id));
  if (accepted.length === 0) {
    throw new Error("Select at least one variable to apply.");
  }

  const graph = await parseWorkspaceDir(fs, workspaceRootPath);
  const existing =
    graph.environments.find(
      (e) => e.name.toLowerCase() === envName.toLowerCase(),
    ) ?? null;

  const priorVars: FishKeyValue[] = existing
    ? [...(existing.environment.variables ?? [])]
    : [];

  const merged = mergeDetectedIntoEnv(priorVars, accepted, conflictPolicy);
  const nextVars: FishKeyValue[] = merged.variables.map((v) => ({
    ...(v.id ? { id: v.id } : {}),
    key: v.key,
    value: v.value,
    enabled: v.enabled ?? true,
    ...(v.secret ? { secret: true as const } : {}),
  }));

  for (const det of accepted) {
    if (!det.secret) continue;
    const row = nextVars.find((x) => x.key === det.key);
    if (row) row.secret = true;
  }

  const relativePath =
    existing?.relativePath ??
    `${ENVIRONMENTS_DIR}/${sanitizeEnvFileName(envName)}.json`;
  const secretsRelativePath =
    existing?.secretsRelativePath ??
    relativePath.replace(/\.json$/i, ".secret.json");

  const node: FishEnvironmentNode = {
    id: existing?.id ?? createUid("env"),
    name: envName,
    relativePath,
    secretsRelativePath,
    environment: {
      id: existing?.environment.id ?? existing?.id,
      name: envName,
      seq: existing?.environment.seq ?? graph.environments.length,
      variables: nextVars,
    },
    secretVariables: nextVars.filter((v) => v.secret),
  };

  await writeEnvironment(fs, workspaceRootPath, node);

  const hasSecrets = nextVars.some((v) => v.secret && v.value !== "");

  return {
    envName,
    envId: node.id,
    relativePath,
    secretsRelativePath: hasSecrets ? secretsRelativePath : undefined,
    added: merged.added,
    updated: merged.updated,
    skipped: merged.skipped,
    variables: nextVars,
  };
}

function sanitizeEnvFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "local";
}

/** Default selection: all high-confidence enabled rows. */
export function defaultAcceptedIds(variables: DetectedVariable[]): string[] {
  return variables
    .filter((v) => v.enabled && v.confidence === "high")
    .map((v) => v.id);
}
