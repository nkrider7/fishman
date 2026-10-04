import { describe, it, expect } from "vitest";
import {
  getAnalyticsClientId,
  isTelemetryEnabled,
  setTelemetryEnabled,
  trackEvent,
  trackAppOpen,
} from "./analytics";

describe("analytics service", () => {
  it("generates and persists an anonymous client_id", () => {
    const id1 = getAnalyticsClientId();
    expect(id1).toBeDefined();
    expect(typeof id1).toBe("string");

    const id2 = getAnalyticsClientId();
    expect(id1).toBe(id2);
  });

  it("respects telemetry enabled and disabled states", () => {
    setTelemetryEnabled(true);
    expect(isTelemetryEnabled()).toBe(true);

    setTelemetryEnabled(false);
    expect(isTelemetryEnabled()).toBe(false);

    setTelemetryEnabled(true);
    expect(isTelemetryEnabled()).toBe(true);
  });

  it("does not crash when tracking events without credentials or in node runtime", async () => {
    await expect(trackEvent("test_event", { foo: "bar" })).resolves.not.toThrow();
    await expect(trackAppOpen()).resolves.not.toThrow();
  });
});

