import type { ApiTestConfig } from "./types";

export interface WorkerPlan {
  /** Peak VU target for this test type (capped). */
  maxVus: number;
  /** Number of VU worker loops to spawn (= maxVus). */
  workerCount: number;
  /** Hard cap on concurrent in-flight HTTP calls. */
  maxInFlight: number;
}

const MAX_VUS_HARD = 500;
const MAX_IN_FLIGHT_HARD = 100;

/**
 * Resolve how many VU workers to spawn vs how many requests may be in flight.
 *
 * Important: concurrency is an in-flight cap, NOT the worker-pool size.
 * Under-spawning workers when maxVus > maxConcurrency was a bug that capped
 * effective load incorrectly.
 */
export function resolveWorkerPlan(config: ApiTestConfig): WorkerPlan {
  let maxVus: number;

  switch (config.testType) {
    case "stress":
      maxVus = Math.max(config.rampStartVus, config.rampEndVus, 1);
      break;
    case "spike":
      maxVus = Math.max(config.spikeBaseVus, config.spikePeakVus, 1);
      break;
    case "chain":
      maxVus = 1;
      break;
    default:
      maxVus = Math.max(1, config.virtualUsers);
      break;
  }

  maxVus = Math.min(MAX_VUS_HARD, Math.floor(maxVus));
  const maxInFlight = Math.min(
    MAX_IN_FLIGHT_HARD,
    Math.max(1, Math.floor(config.maxConcurrency || 50)),
  );

  return {
    maxVus,
    workerCount: maxVus,
    maxInFlight,
  };
}
