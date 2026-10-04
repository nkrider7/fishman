/** Confidence of a detected → Fishman variable mapping. */
export type DetectConfidence = "high" | "medium" | "low";

export type DetectSourceKind =
  | "dotenv"
  | "docker-compose"
  | "k8s"
  | "package-json"
  | "heuristic";

export interface DetectSourceRef {
  kind: DetectSourceKind;
  /** Path relative to project root. */
  path: string;
  /** Original key in the source file (e.g. VITE_API_URL). */
  originalKey?: string;
  /** Short, non-secret evidence (e.g. "PORT=4000"). */
  evidence?: string;
}

export interface DetectedVariable {
  id: string;
  /** Canonical Fishman variable key (e.g. baseUrl, token). */
  key: string;
  value: string;
  secret: boolean;
  enabled: boolean;
  confidence: DetectConfidence;
  source: DetectSourceRef;
  /**
   * When this row is a demoted alias of another key (e.g. kept VITE_API_URL
   * after promoting to baseUrl), the primary key it aliases.
   */
  aliasOf?: string;
}

export interface DetectSourceResult {
  path: string;
  kind: DetectSourceKind;
  ok: boolean;
  error?: string;
  /** Number of raw KEY=VALUE pairs read (before mapping). */
  rawCount?: number;
}

export interface EnvDetectReport {
  projectPath: string;
  scannedAt: string;
  sources: DetectSourceResult[];
  variables: DetectedVariable[];
  suggestedEnvName: string;
  /** Globs / names that were searched (for empty-state copy). */
  searchedPatterns: string[];
}

export type EnvDetectConflictPolicy = "skip" | "overwrite";

export interface EnvDetectApplyOptions {
  envName: string;
  /** Accepted detection row ids. */
  acceptedIds: string[];
  conflictPolicy: EnvDetectConflictPolicy;
}

export interface MergeEnvResult {
  variables: Array<{
    key: string;
    value: string;
    enabled: boolean;
    secret?: boolean;
    id?: string;
  }>;
  added: number;
  updated: number;
  skipped: number;
}
