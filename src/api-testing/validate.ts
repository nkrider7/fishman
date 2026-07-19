import type { ApiTestConfig } from "./types";

export type ApiTestValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

const HTTP_URL_RE = /^https?:\/\//i;

/**
 * Validate config before starting a run. Returns friendly messages for the UI.
 */
export function validateApiTestConfig(config: ApiTestConfig): ApiTestValidation {
  const errors: string[] = [];
  const url = config.url.trim();

  if (!url) {
    errors.push("Enter a request URL before running.");
  } else if (!HTTP_URL_RE.test(url) && !url.includes("{{")) {
    // Allow variable templates like {{baseUrl}}/path
    errors.push("URL must start with http:// or https:// (or use {{variables}}).");
  }

  if (!Number.isFinite(config.durationSec) || config.durationSec < 1) {
    errors.push("Duration must be at least 1 second.");
  }

  const maxDuration = config.testType === "soak" ? 3600 : 600;
  if (config.durationSec > maxDuration) {
    errors.push(`Duration cannot exceed ${maxDuration} seconds for this test type.`);
  }

  if (config.testType === "stress") {
    if (config.rampStartVus < 1 || config.rampEndVus < 1) {
      errors.push("Stress ramp VUs must be at least 1.");
    }
    if (config.rampStartVus > config.rampEndVus) {
      errors.push("Start VUs cannot be greater than End VUs.");
    }
  } else if (config.testType === "spike") {
    if (config.spikeBaseVus < 1 || config.spikePeakVus < 1) {
      errors.push("Spike VUs must be at least 1.");
    }
    if (config.spikePeakVus < config.spikeBaseVus) {
      errors.push("Spike VUs cannot be less than Base VUs.");
    }
    if (config.spikeDurationSec < 1 || config.recoveryDurationSec < 1) {
      errors.push("Spike and recovery durations must be at least 1 second.");
    }
  } else if (config.testType !== "chain") {
    if (!Number.isFinite(config.virtualUsers) || config.virtualUsers < 1) {
      errors.push("Virtual users must be at least 1.");
    }
  }

  if (config.testType === "assertions") {
    if (
      !Number.isFinite(config.expectedStatus) ||
      config.expectedStatus < 100 ||
      config.expectedStatus > 599
    ) {
      errors.push("Expected status must be between 100 and 599.");
    }
    if (!Number.isFinite(config.maxLatencyMs) || config.maxLatencyMs < 1) {
      errors.push("Max latency must be at least 1 ms.");
    }
  }

  if (
    !Number.isFinite(config.maxConcurrency) ||
    config.maxConcurrency < 1 ||
    config.maxConcurrency > 100
  ) {
    errors.push("Max concurrency must be between 1 and 100.");
  }

  if (
    !Number.isFinite(config.timeoutMs) ||
    config.timeoutMs < 1000 ||
    config.timeoutMs > 120_000
  ) {
    errors.push("Timeout must be between 1000 and 120000 ms.");
  }

  if (!Number.isFinite(config.thinkTimeMs) || config.thinkTimeMs < 0) {
    errors.push("Think time cannot be negative.");
  }

  if (!Number.isFinite(config.requestsPerVu) || config.requestsPerVu < 0) {
    errors.push("Requests / VU cannot be negative.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

/** First error message for inline UI. */
export function firstValidationError(config: ApiTestConfig): string | null {
  const result = validateApiTestConfig(config);
  if (result.ok) return null;
  return result.errors[0] ?? null;
}
