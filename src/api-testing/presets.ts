import type { ApiTestConfig, ApiTestType } from "./types";
import type { AuthType, BodyType, HttpMethod, KeyValue } from "@/types/request";

export type PresetAccent =
  | "amber"
  | "rose"
  | "violet"
  | "sky"
  | "emerald"
  | "cyan";

export interface ApiTestPreset {
  id: ApiTestType;
  title: string;
  summary: string;
  icon: "zap" | "trending" | "activity" | "clock" | "check" | "link";
  accent: PresetAccent;
  /** Longer help text shown in the info tip. */
  info: string;
}

export const API_TEST_PRESETS: ApiTestPreset[] = [
  {
    id: "load",
    title: "Quick Load Test",
    summary: "10 VUs for 30 seconds",
    icon: "zap",
    accent: "amber",
    info: "Holds a steady number of virtual users for a fixed duration. Best for measuring baseline latency, throughput, and error rate under expected traffic.",
  },
  {
    id: "stress",
    title: "Stress Test",
    summary: "Ramp 1 → 100 VUs over 60s",
    icon: "trending",
    accent: "rose",
    info: "Gradually increases virtual users to find where your API starts to degrade. Watch error rate and p95 — Fishman can stop automatically when the error threshold is crossed (breaking point).",
  },
  {
    id: "spike",
    title: "Spike Test",
    summary: "5 base → 50 burst → recovery",
    icon: "activity",
    accent: "violet",
    info: "Runs three phases: baseline load, a sudden burst of traffic, then recovery. Use this to see how quickly the service stabilizes after a traffic spike.",
  },
  {
    id: "soak",
    title: "Soak Test",
    summary: "5 VUs for 5 minutes",
    icon: "clock",
    accent: "sky",
    info: "Sustains a modest load for a long time (up to 1 hour). Helps catch memory leaks, connection pool exhaustion, and slow degradation that short tests miss.",
  },
  {
    id: "assertions",
    title: "Response Check",
    summary: "Status 200 + timing < 500ms",
    icon: "check",
    accent: "emerald",
    info: "Treats wrong status codes or slow responses as errors. Ideal for a quick health check that your endpoint meets status and latency SLOs.",
  },
  {
    id: "chain",
    title: "Chain Test",
    summary: "Sequential repeats of active request",
    icon: "link",
    accent: "cyan",
    info: "Repeats the configured request one-after-another (single VU). Useful for smoke runs and ordered steps without concurrent load.",
  },
];

/** Theme-friendly accent styles per preset (light + dark). */
export const PRESET_ACCENT_STYLES: Record<
  PresetAccent,
  {
    border: string;
    borderActive: string;
    bg: string;
    bgActive: string;
    icon: string;
    iconBg: string;
    ring: string;
  }
> = {
  amber: {
    border: "border-amber-500/25 hover:border-amber-500/45",
    borderActive: "border-amber-500/70",
    bg: "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]",
    bgActive: "bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/15",
    ring: "ring-amber-500/35",
  },
  rose: {
    border: "border-rose-500/25 hover:border-rose-500/45",
    borderActive: "border-rose-500/70",
    bg: "bg-rose-500/[0.04] hover:bg-rose-500/[0.08]",
    bgActive: "bg-rose-500/10",
    icon: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-500/15",
    ring: "ring-rose-500/35",
  },
  violet: {
    border: "border-violet-500/25 hover:border-violet-500/45",
    borderActive: "border-violet-500/70",
    bg: "bg-violet-500/[0.04] hover:bg-violet-500/[0.08]",
    bgActive: "bg-violet-500/10",
    icon: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-500/15",
    ring: "ring-violet-500/35",
  },
  sky: {
    border: "border-sky-500/25 hover:border-sky-500/45",
    borderActive: "border-sky-500/70",
    bg: "bg-sky-500/[0.04] hover:bg-sky-500/[0.08]",
    bgActive: "bg-sky-500/10",
    icon: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-500/15",
    ring: "ring-sky-500/35",
  },
  emerald: {
    border: "border-emerald-500/25 hover:border-emerald-500/45",
    borderActive: "border-emerald-500/70",
    bg: "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]",
    bgActive: "bg-emerald-500/10",
    icon: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-500/15",
    ring: "ring-emerald-500/35",
  },
  cyan: {
    border: "border-cyan-500/25 hover:border-cyan-500/45",
    borderActive: "border-cyan-500/70",
    bg: "bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08]",
    bgActive: "bg-cyan-500/10",
    icon: "text-cyan-600 dark:text-cyan-400",
    iconBg: "bg-cyan-500/15",
    ring: "ring-cyan-500/35",
  },
};

export function defaultApiTestConfig(): ApiTestConfig {
  return {
    testType: "load",
    method: "GET",
    url: "",
    headers: [],
    params: [],
    bodyType: "none",
    body: "",
    authType: "none",
    auth: { type: "none" },
    virtualUsers: 10,
    durationSec: 30,
    requestsPerVu: 0,
    rampCurve: "linear",
    rampStartVus: 1,
    rampEndVus: 100,
    spikeBaseVus: 5,
    spikePeakVus: 50,
    spikeDurationSec: 10,
    recoveryDurationSec: 15,
    expectedStatus: 200,
    maxLatencyMs: 500,
    thinkTimeMs: 0,
    timeoutMs: 30000,
    maxConcurrency: 50,
    errorRateThresholdPct: 5,
    stopOnBreakingPoint: true,
  };
}

/** Apply preset defaults onto config while keeping request fields. */
export function applyPreset(
  config: ApiTestConfig,
  type: ApiTestType,
): ApiTestConfig {
  const next = { ...config, testType: type };
  switch (type) {
    case "load":
      return {
        ...next,
        virtualUsers: 10,
        durationSec: 30,
        requestsPerVu: 0,
      };
    case "stress":
      return {
        ...next,
        virtualUsers: 1,
        durationSec: 60,
        rampStartVus: 1,
        rampEndVus: 100,
        rampCurve: "linear",
        requestsPerVu: 0,
      };
    case "spike":
      return {
        ...next,
        durationSec: 45,
        spikeBaseVus: 5,
        spikePeakVus: 50,
        spikeDurationSec: 10,
        recoveryDurationSec: 15,
        virtualUsers: 5,
        requestsPerVu: 0,
      };
    case "soak":
      return {
        ...next,
        virtualUsers: 5,
        durationSec: 300,
        requestsPerVu: 0,
      };
    case "assertions":
      return {
        ...next,
        virtualUsers: 5,
        durationSec: 20,
        expectedStatus: 200,
        maxLatencyMs: 500,
        requestsPerVu: 0,
      };
    case "chain":
      return {
        ...next,
        virtualUsers: 1,
        durationSec: 30,
        requestsPerVu: 10,
      };
    default:
      return next;
  }
}

export function configFromActiveRequest(input: {
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  bodyType: BodyType;
  body: string;
  authType?: AuthType;
  auth?: Record<string, unknown>;
}): Partial<ApiTestConfig> {
  return {
    method: input.method,
    url: input.url,
    headers: structuredClone(input.headers),
    params: structuredClone(input.params),
    bodyType: input.bodyType,
    body: input.body,
    authType: input.authType ?? "none",
    auth: input.auth ?? { type: "none" },
  };
}

export const TEST_TYPE_LABELS: Record<ApiTestType, string> = {
  load: "Load Test — Constant virtual users for a set duration",
  stress: "Stress Test — Ramp VUs to find the breaking point",
  spike: "Spike Test — Sudden burst then recovery",
  soak: "Soak Test — Sustained low load over time",
  assertions: "Response Check — Status and latency assertions",
  chain: "Chain Test — Sequential repeats of one request",
};

export const FIELD_HELP = {
  virtualUsers:
    "How many simulated clients hit the API at once. Higher values increase load.",
  duration:
    "How long the test runs. Load stops when duration ends (unless Requests/VU finishes first).",
  requestsPerVu:
    "Max requests each virtual user sends. Use 0 to keep sending until the duration ends.",
  rampCurve:
    "How VUs increase over time: linear (steady), stepped (jumps), or exponential (slow then steep).",
  rampStart: "Virtual users at the start of the stress ramp.",
  rampEnd:
    "Virtual users at the end of the ramp (max 500). The breaking point usually appears before this.",
  errorThreshold:
    "If the recent error rate exceeds this %, Fishman records a breaking point (and can stop the test).",
  spikeBase: "Steady traffic before and after the burst.",
  spikePeak: "Virtual users during the spike burst.",
  spikeDuration: "How long the burst phase lasts.",
  recovery: "How long to watch the API after the spike ends.",
  expectedStatus:
    "HTTP status that counts as success (others count as errors).",
  maxLatency:
    "Responses slower than this are counted as errors in Response Check mode.",
  thinkTime:
    "Optional pause between requests from the same VU (simulates user think time).",
  timeout: "Abort a single request after this many milliseconds.",
  maxConcurrency:
    "Hard cap on in-flight HTTP calls. Protects your machine even if VUs are higher.",
  stopOnBreak:
    "When enabled on stress tests, automatically stop once the error-rate threshold is crossed.",
  useActive:
    "Copy method, URL, headers, body, and auth from the request tab you currently have open.",
} as const;
