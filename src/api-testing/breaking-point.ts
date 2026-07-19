export interface BreakingPointInput {
  errorRatePct: number;
  thresholdPct: number;
  /** Recent window must have enough samples to avoid false positives. */
  windowRequests: number;
  minWindowRequests?: number;
  elapsedSec: number;
  currentVus: number;
}

export interface BreakingPointResult {
  detected: boolean;
  reason: string;
}

/**
 * Detect when error rate over a sliding window exceeds the configured threshold.
 */
export function detectBreakingPoint(
  input: BreakingPointInput,
): BreakingPointResult {
  const minSamples = input.minWindowRequests ?? 20;
  if (input.windowRequests < minSamples) {
    return { detected: false, reason: "" };
  }
  if (input.errorRatePct < input.thresholdPct) {
    return { detected: false, reason: "" };
  }
  return {
    detected: true,
    reason: `Error rate ${input.errorRatePct.toFixed(1)}% exceeded ${input.thresholdPct}% threshold at ${input.currentVus} VUs`,
  };
}

/** Sliding window helper for recent success/error counts. */
export class ErrorRateWindow {
  private readonly windowMs: number;
  private events: Array<{ at: number; error: boolean }> = [];

  constructor(windowMs = 5000) {
    this.windowMs = windowMs;
  }

  push(atMs: number, isError: boolean): void {
    this.events.push({ at: atMs, error: isError });
    this.prune(atMs);
  }

  prune(nowMs: number): void {
    const cut = nowMs - this.windowMs;
    while (this.events.length > 0 && this.events[0]!.at < cut) {
      this.events.shift();
    }
  }

  stats(nowMs: number): { total: number; errors: number; errorRatePct: number } {
    this.prune(nowMs);
    const total = this.events.length;
    const errors = this.events.filter((e) => e.error).length;
    return {
      total,
      errors,
      errorRatePct: total === 0 ? 0 : (errors / total) * 100,
    };
  }

  clear(): void {
    this.events = [];
  }
}
