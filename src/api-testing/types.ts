import type { AuthType, BodyType, HttpMethod, KeyValue } from "@/types/request";

export type ApiTestType =
  | "load"
  | "stress"
  | "spike"
  | "soak"
  | "assertions"
  | "chain";

export type RampCurve = "linear" | "stepped" | "exponential";

export type ApiTestPhase =
  | "idle"
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export type ApiTestView = "config" | "results";

export type ResultsTab = "summary" | "timeline" | "errors";

export interface ApiTestRequestSpec {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  bodyType: BodyType;
  body: string;
  authType: AuthType;
  auth: Record<string, unknown>;
}

export interface ApiTestConfig {
  testType: ApiTestType;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  bodyType: BodyType;
  body: string;
  authType: AuthType;
  auth: Record<string, unknown>;
  /** Constant / base VUs (load, soak, assertions, chain). */
  virtualUsers: number;
  /** Total test duration in seconds. */
  durationSec: number;
  /** Max requests per VU; 0 = unlimited until duration ends. */
  requestsPerVu: number;
  /** Stress ramp */
  rampCurve: RampCurve;
  rampStartVus: number;
  rampEndVus: number;
  /** Spike */
  spikeBaseVus: number;
  spikePeakVus: number;
  spikeDurationSec: number;
  recoveryDurationSec: number;
  /** Assertions */
  expectedStatus: number;
  maxLatencyMs: number;
  /** Advanced */
  thinkTimeMs: number;
  timeoutMs: number;
  maxConcurrency: number;
  errorRateThresholdPct: number;
  stopOnBreakingPoint: boolean;
}

export interface LatencyBuckets {
  lt50: number;
  b50_100: number;
  b100_200: number;
  b200_500: number;
  b500_1000: number;
  gt1000: number;
}

export interface ApiTestMetrics {
  totalRequests: number;
  errorCount: number;
  errorRatePct: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughputRps: number;
  statusCounts: Record<string, number>;
  buckets: LatencyBuckets;
}

export interface TimelineRow {
  elapsedSec: number;
  vus: number;
  rps: number;
  avgMs: number;
  p95Ms: number;
  errors: number;
  phase?: string;
}

export interface ApiTestErrorSample {
  atMs: number;
  status: number;
  message: string;
  latencyMs: number;
  vuId: number;
}

export interface BreakingPointInfo {
  atElapsedSec: number;
  errorRatePct: number;
  vus: number;
  reason: string;
}

export interface ApiTestRunSnapshot {
  phase: ApiTestPhase;
  startedAt: number | null;
  elapsedMs: number;
  progressPct: number;
  currentVus: number;
  metrics: ApiTestMetrics;
  timeline: TimelineRow[];
  errors: ApiTestErrorSample[];
  breakingPoint: BreakingPointInfo | null;
  spikePhase: "pre" | "spike" | "recovery" | null;
}

export const LATENCY_BUCKET_KEYS = [
  "lt50",
  "b50_100",
  "b100_200",
  "b200_500",
  "b500_1000",
  "gt1000",
] as const;

export const LATENCY_BUCKET_LABELS: Record<
  (typeof LATENCY_BUCKET_KEYS)[number],
  string
> = {
  lt50: "<50ms",
  b50_100: "50-100ms",
  b100_200: "100-200ms",
  b200_500: "200-500ms",
  b500_1000: "500-1000ms",
  gt1000: ">1000ms",
};

export function emptyBuckets(): LatencyBuckets {
  return {
    lt50: 0,
    b50_100: 0,
    b100_200: 0,
    b200_500: 0,
    b500_1000: 0,
    gt1000: 0,
  };
}

export function emptyMetrics(): ApiTestMetrics {
  return {
    totalRequests: 0,
    errorCount: 0,
    errorRatePct: 0,
    avgMs: 0,
    minMs: 0,
    maxMs: 0,
    p50Ms: 0,
    p90Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    throughputRps: 0,
    statusCounts: {},
    buckets: emptyBuckets(),
  };
}
