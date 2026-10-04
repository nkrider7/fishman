export type {
  DetectConfidence,
  DetectSourceKind,
  DetectSourceRef,
  DetectedVariable,
  DetectSourceResult,
  EnvDetectReport,
  EnvDetectConflictPolicy,
  EnvDetectApplyOptions,
  MergeEnvResult,
} from "./types";

export { parseDotEnv } from "./parse/dotenv";
export {
  classifyEnvPair,
  isSecretKeyName,
  looksLikeCredentialUrl,
  normalizeUrlCandidate,
  toCamelCase,
} from "./classify";
export { suggestVariables, sourceKindLabel } from "./suggest";
export { mergeDetectedIntoEnv, isStubLocalEnvironment } from "./merge";
export { scanProjectEnv, DOTENV_CANDIDATES } from "./scan";
export {
  applyEnvDetectToWorkspace,
  defaultAcceptedIds,
  type ApplyEnvDetectResult,
  type ApplyEnvDetectOptions,
} from "./apply";
