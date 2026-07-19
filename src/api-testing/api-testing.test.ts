import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { percentile, bucketForLatency, progressPercent } from "./metrics";
import { rampTargetVus, spikePhaseAt, spikeTargetVus } from "./ramp";
import { detectBreakingPoint, ErrorRateWindow } from "./breaking-point";
import { validateApiTestConfig, firstValidationError } from "./validate";
import { resolveWorkerPlan } from "./worker-plan";
import { defaultApiTestConfig, applyPreset } from "./presets";
import { runApiTest } from "./engine";
import type { ApiResponse } from "@/types/response";

vi.mock("@/services/apiService", () => ({
  sendHttpRequest: vi.fn(),
}));

import { sendHttpRequest } from "@/services/apiService";

const mockedSend = vi.mocked(sendHttpRequest);

function okResponse(status = 200, durationMs = 12): ApiResponse {
  return {
    status,
    status_text: status === 200 ? "OK" : "Error",
    headers: {},
    body: "{}",
    size_bytes: 2,
    duration_ms: durationMs,
    timing: {
      total_ms: durationMs,
      dns_ms: null,
      connect_ms: null,
      ttfb_ms: null,
    },
  };
}

describe("percentile", () => {
  it("returns 0 for empty", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("computes nearest-rank percentiles", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(sorted, 50)).toBe(50);
    expect(percentile(sorted, 90)).toBe(90);
    expect(percentile(sorted, 100)).toBe(100);
  });
});

describe("bucketForLatency", () => {
  it("maps ranges", () => {
    expect(bucketForLatency(10)).toBe("lt50");
    expect(bucketForLatency(75)).toBe("b50_100");
    expect(bucketForLatency(150)).toBe("b100_200");
    expect(bucketForLatency(300)).toBe("b200_500");
    expect(bucketForLatency(700)).toBe("b500_1000");
    expect(bucketForLatency(1500)).toBe("gt1000");
  });
});

describe("progressPercent", () => {
  it("clamps 0–100", () => {
    expect(progressPercent(0, 30)).toBe(0);
    expect(progressPercent(15000, 30)).toBe(50);
    expect(progressPercent(60000, 30)).toBe(100);
  });
});

describe("rampTargetVus", () => {
  it("linear ramp", () => {
    expect(rampTargetVus(0, 1, 100, "linear")).toBe(1);
    expect(rampTargetVus(1, 1, 100, "linear")).toBe(100);
    expect(rampTargetVus(0.5, 1, 101, "linear")).toBe(51);
  });

  it("stepped ramp uses discrete steps", () => {
    const a = rampTargetVus(0.05, 1, 100, "stepped", 10);
    const b = rampTargetVus(0.09, 1, 100, "stepped", 10);
    expect(a).toBe(b);
    const c = rampTargetVus(0.2, 1, 100, "stepped", 10);
    expect(c).toBeGreaterThan(a);
  });
});

describe("spike helpers", () => {
  it("assigns phases", () => {
    expect(spikePhaseAt(0, 45, 10, 15)).toBe("pre");
    expect(spikePhaseAt(19, 45, 10, 15)).toBe("pre");
    expect(spikePhaseAt(25, 45, 10, 15)).toBe("spike");
    expect(spikePhaseAt(40, 45, 10, 15)).toBe("recovery");
  });

  it("handles spike+recovery longer than configured duration", () => {
    // total becomes max(10+15+1, 5) = 26
    expect(spikePhaseAt(0, 5, 10, 15)).toBe("pre");
    expect(spikePhaseAt(2, 5, 10, 15)).toBe("spike");
  });

  it("maps phase to VUs", () => {
    expect(spikeTargetVus("pre", 5, 50)).toBe(5);
    expect(spikeTargetVus("spike", 5, 50)).toBe(50);
    expect(spikeTargetVus("recovery", 5, 50)).toBe(5);
  });
});

describe("detectBreakingPoint", () => {
  it("ignores small windows", () => {
    expect(
      detectBreakingPoint({
        errorRatePct: 50,
        thresholdPct: 5,
        windowRequests: 5,
        elapsedSec: 3,
        currentVus: 10,
      }).detected,
    ).toBe(false);
  });

  it("fires when threshold exceeded", () => {
    const r = detectBreakingPoint({
      errorRatePct: 12,
      thresholdPct: 5,
      windowRequests: 40,
      elapsedSec: 20,
      currentVus: 80,
    });
    expect(r.detected).toBe(true);
    expect(r.reason).toContain("12.0%");
  });
});

describe("ErrorRateWindow", () => {
  it("tracks sliding error rate", () => {
    const w = new ErrorRateWindow(1000);
    w.push(100, false);
    w.push(200, true);
    w.push(300, false);
    const s = w.stats(300);
    expect(s.total).toBe(3);
    expect(s.errors).toBe(1);
    expect(s.errorRatePct).toBeCloseTo(33.333, 1);
  });
});

describe("validateApiTestConfig", () => {
  it("rejects empty URL", () => {
    const c = defaultApiTestConfig();
    c.url = "  ";
    const r = validateApiTestConfig(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/URL/i);
  });

  it("rejects non-http URL without variables", () => {
    const c = defaultApiTestConfig();
    c.url = "ftp://example.com";
    expect(validateApiTestConfig(c).ok).toBe(false);
  });

  it("allows variable templates", () => {
    const c = defaultApiTestConfig();
    c.url = "{{baseUrl}}/users";
    expect(validateApiTestConfig(c).ok).toBe(true);
  });

  it("rejects start VUs > end VUs on stress", () => {
    const c = applyPreset(defaultApiTestConfig(), "stress");
    c.url = "https://example.com";
    c.rampStartVus = 50;
    c.rampEndVus = 10;
    const r = validateApiTestConfig(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/Start VUs/i);
  });

  it("rejects spike peak < base", () => {
    const c = applyPreset(defaultApiTestConfig(), "spike");
    c.url = "https://example.com";
    c.spikeBaseVus = 40;
    c.spikePeakVus = 10;
    expect(firstValidationError(c)).toMatch(/Spike VUs/i);
  });

  it("accepts a valid load config", () => {
    const c = defaultApiTestConfig();
    c.url = "https://httpbin.org/get";
    expect(validateApiTestConfig(c).ok).toBe(true);
  });
});

describe("resolveWorkerPlan", () => {
  it("does not under-spawn when maxVus > maxConcurrency", () => {
    const c = applyPreset(defaultApiTestConfig(), "stress");
    c.rampEndVus = 100;
    c.maxConcurrency = 10;
    const plan = resolveWorkerPlan(c);
    expect(plan.workerCount).toBe(100);
    expect(plan.maxInFlight).toBe(10);
    expect(plan.maxVus).toBe(100);
  });

  it("forces chain to 1 worker", () => {
    const c = applyPreset(defaultApiTestConfig(), "chain");
    c.virtualUsers = 50;
    expect(resolveWorkerPlan(c).workerCount).toBe(1);
  });
});

describe("runApiTest cancel", () => {
  beforeEach(() => {
    mockedSend.mockReset();
    mockedSend.mockImplementation(async (_d, _s, _v, _c, signal) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 80);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
      return okResponse();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends with cancelled phase when aborted", async () => {
    const ac = new AbortController();
    const config = applyPreset(defaultApiTestConfig(), "load");
    config.url = "https://example.com/api";
    config.virtualUsers = 2;
    config.durationSec = 30;
    config.maxConcurrency = 2;
    config.thinkTimeMs = 0;

    const phases: string[] = [];
    const runPromise = runApiTest({
      config,
      signal: ac.signal,
      onUpdate: (s) => phases.push(s.phase),
    });

    await new Promise((r) => setTimeout(r, 30));
    ac.abort();

    const final = await runPromise;
    expect(final.phase).toBe("cancelled");
    expect(phases).toContain("running");
  }, 10_000);

  it("records assertion pass/fail counts", async () => {
    mockedSend
      .mockResolvedValueOnce(okResponse(200, 10))
      .mockResolvedValueOnce(okResponse(500, 10));

    const ac = new AbortController();
    const config = applyPreset(defaultApiTestConfig(), "assertions");
    config.url = "https://example.com/api";
    config.virtualUsers = 1;
    config.durationSec = 5;
    config.requestsPerVu = 2;
    config.expectedStatus = 200;
    config.maxLatencyMs = 500;
    config.maxConcurrency = 1;

    const final = await runApiTest({
      config,
      signal: ac.signal,
      onUpdate: () => {},
    });

    expect(final.phase).toBe("completed");
    expect(final.metrics.assertionPassCount).toBe(1);
    expect(final.metrics.assertionFailCount).toBe(1);
    expect(final.metrics.errorCount).toBe(1);
  }, 10_000);
});
