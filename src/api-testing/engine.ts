import { sendHttpRequest } from "@/services/apiService";
import type { RequestDraft } from "@/types/request";
import { createEmptyRequest } from "@/types/request";
import type { StoredCookie } from "@/types/cookie";
import {
  detectBreakingPoint,
  ErrorRateWindow,
} from "./breaking-point";
import {
  incrementBucket,
  LatencySampler,
  progressPercent,
} from "./metrics";
import { rampTargetVus, spikePhaseAt, spikeTargetVus } from "./ramp";
import type {
  ApiTestConfig,
  ApiTestErrorSample,
  ApiTestMetrics,
  ApiTestRunSnapshot,
  BreakingPointInfo,
  TimelineRow,
} from "./types";
import { emptyBuckets } from "./types";
import { resolveWorkerPlan } from "./worker-plan";

const MAX_ERROR_SAMPLES = 100;
const UI_TICK_MS = 200;

export interface RunApiTestOptions {
  config: ApiTestConfig;
  variables?: Record<string, string>;
  cookies?: StoredCookie[];
  ignoreSsl?: boolean;
  signal: AbortSignal;
  onUpdate: (snapshot: ApiTestRunSnapshot) => void;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = globalThis.setTimeout(resolve, ms);
    const onAbort = () => {
      globalThis.clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function buildDraft(config: ApiTestConfig): RequestDraft {
  const draft = createEmptyRequest("API Test");
  return {
    ...draft,
    method: config.method,
    url: config.url.trim(),
    headers: config.headers,
    params: config.params,
    bodyType: config.bodyType,
    body: config.body,
    auth: {
      type: config.authType,
      bearer: config.auth.bearer as { token: string } | undefined,
      apikey: config.auth.apikey as
        | { key: string; value: string; addTo: "header" | "query" }
        | undefined,
      basic: config.auth.basic as
        | { username: string; password: string }
        | undefined,
      oauth2: config.auth.oauth2 as { accessToken: string } | undefined,
      jwt: config.auth.jwt as { token: string } | undefined,
      custom: config.auth.custom as { key: string; value: string } | undefined,
    },
  };
}

function targetVusAt(
  config: ApiTestConfig,
  elapsedSec: number,
): {
  vus: number;
  spikePhase: "pre" | "spike" | "recovery" | null;
} {
  const t = config.durationSec > 0 ? elapsedSec / config.durationSec : 1;

  switch (config.testType) {
    case "stress":
      return {
        vus: Math.min(
          500,
          rampTargetVus(
            t,
            config.rampStartVus,
            config.rampEndVus,
            config.rampCurve,
          ),
        ),
        spikePhase: null,
      };
    case "spike": {
      const phase = spikePhaseAt(
        elapsedSec,
        config.durationSec,
        config.spikeDurationSec,
        config.recoveryDurationSec,
      );
      return {
        vus: spikeTargetVus(phase, config.spikeBaseVus, config.spikePeakVus),
        spikePhase: phase,
      };
    }
    case "chain":
      return { vus: 1, spikePhase: null };
    default:
      return {
        vus: Math.max(1, Math.min(500, config.virtualUsers)),
        spikePhase: null,
      };
  }
}

export async function runApiTest(
  options: RunApiTestOptions,
): Promise<ApiTestRunSnapshot> {
  const { config, signal, onUpdate } = options;
  const startedAt = Date.now();
  const durationMs = Math.max(1, config.durationSec) * 1000;
  const plan = resolveWorkerPlan(config);
  const maxConcurrency = plan.maxInFlight;

  let totalRequests = 0;
  let errorCount = 0;
  let assertionPassCount = 0;
  let assertionFailCount = 0;
  let totalErrorSamples = 0;
  let sumMs = 0;
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = 0;
  const statusCounts: Record<string, number> = {};
  const buckets = emptyBuckets();
  const sampler = new LatencySampler(5000);
  const errorSamples: ApiTestErrorSample[] = [];
  const timeline: TimelineRow[] = [];
  const errorWindow = new ErrorRateWindow(5000);
  let breakingPoint: BreakingPointInfo | null = null;
  let lastTimelineSec = -1;
  let intervalErrors = 0;
  let intervalReqs = 0;
  let intervalSum = 0;
  let intervalLatencies: number[] = [];
  let inFlight = 0;
  let activeWorkers = 0;
  let stopReason: "completed" | "cancelled" | "failed" | "breaking" =
    "completed";
  let failMessage = "";

  const draft = buildDraft(config);
  if (!draft.url) {
    throw new Error("URL is required");
  }

  const buildMetrics = (elapsedMs: number): ApiTestMetrics => {
    const pct = sampler.percentiles();
    const avg = totalRequests > 0 ? sumMs / totalRequests : 0;
    const rps = elapsedMs > 0 ? totalRequests / (elapsedMs / 1000) : 0;
    return {
      totalRequests,
      errorCount,
      errorRatePct:
        totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
      avgMs: Math.round(avg),
      minMs: totalRequests > 0 ? Math.round(minMs) : 0,
      maxMs: Math.round(maxMs),
      p50Ms: Math.round(pct.p50),
      p90Ms: Math.round(pct.p90),
      p95Ms: Math.round(pct.p95),
      p99Ms: Math.round(pct.p99),
      throughputRps: Math.round(rps * 10) / 10,
      statusCounts: { ...statusCounts },
      buckets: { ...buckets },
      assertionPassCount,
      assertionFailCount,
      totalErrorSamples,
    };
  };

  const snapshot = (
    phase: ApiTestRunSnapshot["phase"],
  ): ApiTestRunSnapshot => {
    const elapsedMs = Date.now() - startedAt;
    const elapsedSec = elapsedMs / 1000;
    const { vus, spikePhase } = targetVusAt(config, elapsedSec);
    return {
      phase,
      startedAt,
      elapsedMs,
      progressPct: progressPercent(elapsedMs, config.durationSec),
      currentVus: vus,
      metrics: buildMetrics(elapsedMs),
      timeline: [...timeline],
      errors: [...errorSamples],
      breakingPoint,
      spikePhase,
    };
  };

  const flushTimeline = (elapsedSec: number, vus: number, phase?: string) => {
    const sec = Math.floor(elapsedSec);
    if (sec === lastTimelineSec) return;
    if (lastTimelineSec >= 0) {
      const sorted = [...intervalLatencies].sort((a, b) => a - b);
      const p95 =
        sorted.length === 0
          ? 0
          : sorted[
              Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)
            ]!;
      timeline.push({
        elapsedSec: lastTimelineSec,
        vus,
        rps: intervalReqs,
        avgMs: intervalReqs > 0 ? Math.round(intervalSum / intervalReqs) : 0,
        p95Ms: Math.round(p95),
        errors: intervalErrors,
        phase,
      });
      if (timeline.length > 3600) timeline.shift();
    }
    lastTimelineSec = sec;
    intervalErrors = 0;
    intervalReqs = 0;
    intervalSum = 0;
    intervalLatencies = [];
  };

  const recordResult = (
    latencyMs: number,
    status: number,
    isError: boolean,
    message: string,
    vuId: number,
    assertionResult?: "pass" | "fail",
  ) => {
    const now = Date.now() - startedAt;
    totalRequests += 1;
    intervalReqs += 1;
    sumMs += latencyMs;
    intervalSum += latencyMs;
    intervalLatencies.push(latencyMs);
    minMs = Math.min(minMs, latencyMs);
    maxMs = Math.max(maxMs, latencyMs);
    sampler.push(latencyMs);
    incrementBucket(buckets, latencyMs);
    const key = String(status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    errorWindow.push(now, isError);

    if (assertionResult === "pass") assertionPassCount += 1;
    if (assertionResult === "fail") assertionFailCount += 1;

    if (isError) {
      errorCount += 1;
      intervalErrors += 1;
      totalErrorSamples += 1;
      if (errorSamples.length < MAX_ERROR_SAMPLES) {
        errorSamples.push({
          atMs: now,
          status,
          message: message.slice(0, 240),
          latencyMs: Math.round(latencyMs),
          vuId,
        });
      }
    }

    if (
      !breakingPoint &&
      (config.testType === "stress" || config.stopOnBreakingPoint)
    ) {
      const win = errorWindow.stats(now);
      const hit = detectBreakingPoint({
        errorRatePct: win.errorRatePct,
        thresholdPct: config.errorRateThresholdPct,
        windowRequests: win.total,
        elapsedSec: now / 1000,
        currentVus: targetVusAt(config, now / 1000).vus,
      });
      if (hit.detected) {
        const { vus } = targetVusAt(config, now / 1000);
        breakingPoint = {
          atElapsedSec: Math.round(now / 1000),
          errorRatePct: win.errorRatePct,
          vus,
          reason: hit.reason,
        };
        if (config.stopOnBreakingPoint && config.testType === "stress") {
          stopReason = "breaking";
        }
      }
    }
  };

  const shouldStop = () =>
    signal.aborted ||
    Date.now() - startedAt >= durationMs ||
    stopReason === "breaking";

  const runOneRequest = async (vuId: number) => {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const t0 = performance.now();
    try {
      const response = await sendHttpRequest(
        draft,
        {
          ignoreSsl: options.ignoreSsl ?? false,
          timeoutMs: config.timeoutMs || 30000,
        },
        options.variables,
        options.cookies ?? [],
        signal,
      );
      const latency = response.duration_ms || performance.now() - t0;
      let isError = Boolean(response.error) || response.status >= 400;
      let message =
        response.error || response.status_text || `HTTP ${response.status}`;
      let assertionResult: "pass" | "fail" | undefined;

      if (config.testType === "assertions") {
        if (response.status !== config.expectedStatus) {
          isError = true;
          assertionResult = "fail";
          message = `Expected status ${config.expectedStatus}, got ${response.status}`;
        } else if (latency > config.maxLatencyMs) {
          isError = true;
          assertionResult = "fail";
          message = `Latency ${Math.round(latency)}ms exceeded ${config.maxLatencyMs}ms`;
        } else {
          isError = false;
          assertionResult = "pass";
          message = "OK";
        }
      }

      recordResult(
        latency,
        response.status,
        isError,
        message,
        vuId,
        assertionResult,
      );
    } catch (err) {
      if (isAbortError(err)) throw err;
      const latency = performance.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      if (config.testType === "assertions") {
        recordResult(latency, 0, true, message, vuId, "fail");
      } else {
        recordResult(latency, 0, true, message, vuId);
      }
    }
  };

  const worker = async (vuId: number) => {
    activeWorkers += 1;
    let done = 0;
    try {
      while (!shouldStop()) {
        while (inFlight >= maxConcurrency && !shouldStop()) {
          await sleep(5, signal);
        }
        if (shouldStop()) break;

        if (config.requestsPerVu > 0 && done >= config.requestsPerVu) {
          break;
        }

        const elapsedSec = (Date.now() - startedAt) / 1000;
        const { vus } = targetVusAt(config, elapsedSec);
        if (vuId >= vus) {
          await sleep(50, signal);
          continue;
        }

        inFlight += 1;
        try {
          await runOneRequest(vuId);
          done += 1;
        } finally {
          inFlight -= 1;
        }

        if (config.thinkTimeMs > 0 && !shouldStop()) {
          await sleep(config.thinkTimeMs, signal);
        }

        if (config.testType === "chain") {
          await sleep(0, signal);
        }
      }
    } catch (err) {
      if (!isAbortError(err)) {
        failMessage = err instanceof Error ? err.message : String(err);
        stopReason = "failed";
      }
    } finally {
      activeWorkers -= 1;
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < plan.workerCount; i++) {
    workers.push(worker(i));
  }

  let lastEmit = 0;
  const emitPhase = (): ApiTestRunSnapshot["phase"] => {
    if (signal.aborted || stopReason === "cancelled") {
      if (activeWorkers > 0 || inFlight > 0) return "stopping";
      return "cancelled";
    }
    if (shouldStop() && activeWorkers === 0 && inFlight === 0) {
      if (stopReason === "failed") return "failed";
      return "completed";
    }
    if (shouldStop()) return "stopping";
    return "running";
  };

  const tick = async () => {
    while (!shouldStop() || activeWorkers > 0 || inFlight > 0) {
      if (signal.aborted) {
        stopReason = "cancelled";
      }
      const now = Date.now();
      const elapsedSec = (now - startedAt) / 1000;
      const { vus, spikePhase } = targetVusAt(config, elapsedSec);
      flushTimeline(elapsedSec, vus, spikePhase ?? undefined);

      if (now - lastEmit >= UI_TICK_MS) {
        lastEmit = now;
        onUpdate(snapshot(emitPhase()));
      }

      if (shouldStop() && activeWorkers === 0 && inFlight === 0) break;

      try {
        await sleep(UI_TICK_MS / 2, signal);
      } catch {
        stopReason = "cancelled";
        // Keep draining until workers finish; don't sleep on abort again.
        if (activeWorkers === 0 && inFlight === 0) break;
        await new Promise((r) => globalThis.setTimeout(r, UI_TICK_MS / 2));
      }
    }
  };

  onUpdate(snapshot("running"));

  try {
    await Promise.all([Promise.all(workers), tick()]);
  } catch {
    stopReason = signal.aborted ? "cancelled" : "failed";
  }

  // Wait briefly for any stragglers after abort race
  const drainDeadline = Date.now() + 2000;
  while ((activeWorkers > 0 || inFlight > 0) && Date.now() < drainDeadline) {
    onUpdate(snapshot("stopping"));
    await new Promise((r) => globalThis.setTimeout(r, 50));
  }

  const elapsedSec = (Date.now() - startedAt) / 1000;
  const { vus, spikePhase } = targetVusAt(config, elapsedSec);
  flushTimeline(elapsedSec + 1, vus, spikePhase ?? undefined);

  if (signal.aborted) stopReason = "cancelled";

  const finalPhase =
    stopReason === "cancelled"
      ? "cancelled"
      : stopReason === "failed"
        ? "failed"
        : "completed";

  const final = snapshot(finalPhase);
  if (stopReason === "failed" && failMessage) {
    final.errors = [
      ...final.errors,
      {
        atMs: final.elapsedMs,
        status: 0,
        message: failMessage,
        latencyMs: 0,
        vuId: -1,
      },
    ];
    final.metrics = {
      ...final.metrics,
      totalErrorSamples: final.metrics.totalErrorSamples + 1,
    };
  }
  onUpdate(final);
  return final;
}
