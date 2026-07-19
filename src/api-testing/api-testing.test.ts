import { describe, expect, it } from "vitest";
import { percentile, bucketForLatency, progressPercent } from "./metrics";
import { rampTargetVus, spikePhaseAt, spikeTargetVus } from "./ramp";
import { detectBreakingPoint, ErrorRateWindow } from "./breaking-point";

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
    // total 45 → pre = 45-10-15 = 20s, spike 10s, recovery 15s
    expect(spikePhaseAt(0, 45, 10, 15)).toBe("pre");
    expect(spikePhaseAt(19, 45, 10, 15)).toBe("pre");
    expect(spikePhaseAt(25, 45, 10, 15)).toBe("spike");
    expect(spikePhaseAt(40, 45, 10, 15)).toBe("recovery");
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
