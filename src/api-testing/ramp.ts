import type { RampCurve } from "./types";

/**
 * Target VU count at progress t ∈ [0, 1] for the given ramp curve.
 */
export function rampTargetVus(
  t: number,
  start: number,
  end: number,
  curve: RampCurve,
  steps = 10,
): number {
  const clamped = Math.min(1, Math.max(0, t));
  const s = Math.max(1, Math.floor(start));
  const e = Math.max(s, Math.floor(end));
  if (clamped <= 0) return s;
  if (clamped >= 1) return e;

  let factor: number;
  switch (curve) {
    case "stepped": {
      const step = Math.min(steps - 1, Math.floor(clamped * steps));
      factor = step / Math.max(1, steps - 1);
      break;
    }
    case "exponential":
      // Ease-in exponential: slow start, steep near end
      factor = (Math.exp(3 * clamped) - 1) / (Math.exp(3) - 1);
      break;
    case "linear":
    default:
      factor = clamped;
      break;
  }

  return Math.round(s + (e - s) * factor);
}

/** Spike phase at elapsed fraction of total duration. */
export function spikePhaseAt(
  elapsedSec: number,
  totalDurationSec: number,
  spikeDurationSec: number,
  recoveryDurationSec: number,
): "pre" | "spike" | "recovery" {
  const spike = Math.max(1, spikeDurationSec);
  const recovery = Math.max(1, recoveryDurationSec);
  const total = Math.max(spike + recovery + 1, totalDurationSec);
  const pre = Math.max(1, total - spike - recovery);

  if (elapsedSec < pre) return "pre";
  if (elapsedSec < pre + spike) return "spike";
  return "recovery";
}

export function spikeTargetVus(
  phase: "pre" | "spike" | "recovery",
  base: number,
  peak: number,
): number {
  if (phase === "spike") return Math.max(1, Math.floor(peak));
  return Math.max(1, Math.floor(base));
}
