import type { ApiTestConfig, ApiTestRunSnapshot } from "./types";
import { TEST_TYPE_LABELS } from "./presets";

/** Human-readable VU profile for the summary panel / clipboard. */
export function describeVuProfile(config: ApiTestConfig): string {
  switch (config.testType) {
    case "stress":
      return `${config.rampStartVus} → ${config.rampEndVus} (${config.rampCurve})`;
    case "spike":
      return `base ${config.spikeBaseVus} / peak ${config.spikePeakVus}`;
    case "chain":
      return "1 (sequential)";
    default:
      return String(config.virtualUsers);
  }
}

export function formatStatusCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(
    ([a], [b]) => Number(a) - Number(b),
  );
  if (entries.length === 0) return "—";
  return entries.map(([code, n]) => `${code}: ${n}`).join(", ");
}

/** Plain-text summary suitable for clipboard copy. */
export function formatRunSummary(
  config: ApiTestConfig,
  run: ApiTestRunSnapshot,
): string {
  const typeLabel =
    TEST_TYPE_LABELS[config.testType].split("—")[0]?.trim() ?? config.testType;
  const m = run.metrics;
  const lines = [
    `Fishman API Test — ${typeLabel}`,
    `Status: ${run.phase}`,
    `Method: ${config.method} ${config.url}`,
    `Configured duration: ${config.durationSec}s · Elapsed: ${(run.elapsedMs / 1000).toFixed(1)}s`,
    `VUs: ${describeVuProfile(config)} · Peak during run: ${run.currentVus}`,
    `Requests: ${m.totalRequests} · RPS: ${m.throughputRps} · Errors: ${m.errorCount} (${m.errorRatePct.toFixed(1)}%)`,
    `Latency avg/p50/p95/p99: ${m.avgMs}/${m.p50Ms}/${m.p95Ms}/${m.p99Ms} ms`,
    `Status codes: ${formatStatusCounts(m.statusCounts)}`,
  ];

  if (config.testType === "assertions") {
    lines.push(
      `Assertions: ${m.assertionPassCount ?? 0} passed / ${m.assertionFailCount ?? 0} failed (expect ${config.expectedStatus}, ≤${config.maxLatencyMs}ms)`,
    );
  }

  if (run.breakingPoint) {
    lines.push(
      `Breaking point: ${run.breakingPoint.atElapsedSec}s @ ${run.breakingPoint.vus} VUs — ${run.breakingPoint.reason}`,
    );
  }

  return lines.join("\n");
}
