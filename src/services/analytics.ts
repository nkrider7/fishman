/**
 * Google Analytics 4 (GA4) Measurement Protocol Service for Fishman.
 *
 * Tracks anonymous usage (e.g. app launches, active users) using direct HTTP calls.
 * No heavy external analytics scripts or cookies required — 100% desktop-friendly.
 */

// Reads from Vite environment variables (.env file)
const GA_MEASUREMENT_ID: string = "G-4X28WL9M13";
const GA_API_SECRET: string = "1VOHlIIJSaSIP5OlPQvW-A";

const CLIENT_ID_KEY = "fishman_analytics_client_id";
const TELEMETRY_KEY = "fishman_telemetry_enabled";

// Fallback in-memory cache if localStorage is unavailable
const memoryStorage: Record<string, string> = {};

function getStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {
    // Ignore access errors
  }
  return memoryStorage[key] ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Ignore access errors
  }
  memoryStorage[key] = value;
}

/**
 * Returns or creates a persistent anonymous unique client ID for this installation.
 * Google Analytics uses this to count distinct users.
 */
export function getAnalyticsClientId(): string {
  let clientId = getStorageItem(CLIENT_ID_KEY);
  if (!clientId) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      clientId = crypto.randomUUID();
    } else {
      clientId = "client-" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }
    setStorageItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

/**
 * In-memory session ID generated on each application boot.
 */
const SESSION_ID = Date.now().toString();

/**
 * Check if the user has opted out of telemetry.
 */
export function isTelemetryEnabled(): boolean {
  return getStorageItem(TELEMETRY_KEY) !== "false";
}

/**
 * Allow users to enable or disable telemetry.
 */
export function setTelemetryEnabled(enabled: boolean): void {
  setStorageItem(TELEMETRY_KEY, enabled ? "true" : "false");
}

/**
 * Send an event to Google Analytics 4 via the Measurement Protocol.
 * Non-blocking fire-and-forget: will never hang, block, or throw errors if offline.
 */
export async function trackEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {}
): Promise<void> {
  if (!isTelemetryEnabled()) {
    return;
  }

  // If credentials are not configured yet, skip quietly
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
    return;
  }

  const clientId = getAnalyticsClientId();
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    GA_MEASUREMENT_ID
  )}&api_secret=${encodeURIComponent(GA_API_SECRET)}`;

  const payload = {
    client_id: clientId,
    events: [
      {
        name: eventName,
        params: {
          // engagement_time_msec is required for GA4 to mark the user as an "Active User"
          engagement_time_msec: 100,
          session_id: SESSION_ID,
          ...params,
        },
      },
    ],
  };

  try {
    if (typeof fetch !== "undefined") {
      await fetch(url, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  } catch {
    // Silently ignore network or offline errors
  }
}

/**
 * Detect user's operating system platform.
 */
function getPlatform(): "windows" | "macos" | "linux" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

/**
 * Helper to track when the application is opened.
 */
export async function trackAppOpen(): Promise<void> {
  await trackEvent("app_open", {
    app_version: "0.1.2",
    platform: getPlatform(),
  });
}

