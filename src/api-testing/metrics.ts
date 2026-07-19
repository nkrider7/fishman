import type { LatencyBuckets } from "./types";
import { emptyBuckets } from "./types";

/** Sorted copy percentile (nearest-rank). */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank));
  return sortedAsc[idx]!;
}

export function bucketForLatency(ms: number): keyof LatencyBuckets {
  if (ms < 50) return "lt50";
  if (ms < 100) return "b50_100";
  if (ms < 200) return "b100_200";
  if (ms < 500) return "b200_500";
  if (ms < 1000) return "b500_1000";
  return "gt1000";
}

export function incrementBucket(buckets: LatencyBuckets, ms: number): void {
  buckets[bucketForLatency(ms)] += 1;
}

export function cloneBuckets(b: LatencyBuckets): LatencyBuckets {
  return { ...b };
}

/** Fixed-size circular buffer for percentile samples. */
export class LatencySampler {
  private buf: number[] = [];
  private readonly max: number;

  constructor(maxSamples = 5000) {
    this.max = maxSamples;
  }

  push(ms: number): void {
    if (this.buf.length < this.max) {
      this.buf.push(ms);
      return;
    }
    // Reservoir: random replace keeps approximate distribution
    const i = Math.floor(Math.random() * (this.buf.length + 1));
    if (i < this.max) this.buf[i] = ms;
  }

  percentiles(): {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    if (this.buf.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }
    const sorted = [...this.buf].sort((a, b) => a - b);
    return {
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
    };
  }

  clear(): void {
    this.buf = [];
  }
}

export function progressPercent(elapsedMs: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(100, Math.max(0, (elapsedMs / (durationSec * 1000)) * 100));
}

export { emptyBuckets };
