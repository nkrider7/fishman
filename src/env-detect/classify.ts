import type { DetectConfidence } from "./types";

export interface ClassifiedEnvKey {
  /** Canonical Fishman key. */
  key: string;
  /** Transformed value (e.g. PORT → http://localhost:PORT). */
  value: string;
  secret: boolean;
  confidence: DetectConfidence;
  /** Prefer this candidate when multiple map to the same key (higher wins). */
  rank: number;
  /** Keep the original source key as a disabled alias row. */
  keepOriginalAlias: boolean;
}

const API_URL_KEYS = new Set([
  "API_URL",
  "BASE_URL",
  "BASEURL",
  "VITE_API_URL",
  "NEXT_PUBLIC_API_URL",
  "REACT_APP_API_URL",
  "PUBLIC_API_URL",
  "APP_URL",
  "SERVER_URL",
  "API_BASE_URL",
  "VITE_BASE_URL",
  "NUXT_PUBLIC_API_BASE",
]);

const DB_URL_KEYS = new Set([
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRESQL_URL",
  "MYSQL_URL",
  "MONGO_URI",
  "MONGODB_URI",
  "REDIS_URL",
  "DATABASE_URI",
]);

const TOKEN_KEYS = new Set([
  "TOKEN",
  "API_TOKEN",
  "ACCESS_TOKEN",
  "AUTH_TOKEN",
  "JWT",
  "JWT_TOKEN",
  "BEARER_TOKEN",
  "API_KEY",
  "AUTH_KEY",
]);

/** Publishable / non-secret public keys (Stripe pk_, etc.). */
const PUBLIC_KEY_SUFFIXES = ["_PUBLISHABLE_KEY", "_PUBLIC_KEY"];

const SECRET_KEY_RE =
  /(SECRET|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|AUTH_TOKEN|ACCESS_TOKEN|API_TOKEN|API_KEY|JWT|BEARER)/i;

/**
 * Map a raw dotenv KEY=VALUE into a Fishman variable proposal.
 * Returns null when the key should be ignored (empty / not useful).
 */
export function classifyEnvPair(
  originalKey: string,
  rawValue: string,
): ClassifiedEnvKey | null {
  const key = originalKey.trim();
  const value = rawValue.trim();
  if (!key) return null;

  // Already a Fishman template — leave alone (caller may still skip).
  if (value.includes("{{") && value.includes("}}")) {
    return {
      key: toCamelCase(key),
      value,
      secret: false,
      confidence: "low",
      rank: 0,
      keepOriginalAlias: false,
    };
  }

  const upper = key.toUpperCase();

  if (upper === "PORT" && /^\d+$/.test(value)) {
    return {
      key: "baseUrl",
      value: `http://localhost:${value}`,
      secret: false,
      confidence: "high",
      rank: 40,
      keepOriginalAlias: true,
    };
  }

  if (upper === "HOST" || upper === "HOSTNAME") {
    if (value === "0.0.0.0" || value === "127.0.0.1" || value === "localhost") {
      return null; // not useful alone without port
    }
  }

  if (API_URL_KEYS.has(upper) || /(_API_URL|_BASE_URL)$/i.test(key)) {
    const url = normalizeUrlCandidate(value);
    if (!url) return null;
    return {
      key: "baseUrl",
      value: url,
      secret: false,
      confidence: "high",
      rank: 90,
      keepOriginalAlias: originalKey !== "baseUrl",
    };
  }

  if (DB_URL_KEYS.has(upper)) {
    const secret = looksLikeCredentialUrl(value) || isSecretKeyName(upper);
    return {
      key: toCamelCase(key),
      value,
      secret,
      confidence: "high",
      rank: 50,
      keepOriginalAlias: false,
    };
  }

  if (TOKEN_KEYS.has(upper) || isSecretKeyName(upper)) {
    if (isPublicPublishableKey(upper)) {
      return {
        key: toCamelCase(key),
        value,
        secret: false,
        confidence: "medium",
        rank: 30,
        keepOriginalAlias: false,
      };
    }
    const fishKey =
      TOKEN_KEYS.has(upper) || /TOKEN$/i.test(key) ? "token" : toCamelCase(key);
    return {
      key: fishKey,
      value,
      secret: true,
      confidence: "high",
      rank: fishKey === "token" ? 80 : 50,
      keepOriginalAlias: fishKey !== toCamelCase(key),
    };
  }

  // Generic fallback: keep original name (camelCase), classify secrecy by name/value.
  const secret = isSecretKeyName(upper) || looksLikeCredentialUrl(value);
  return {
    key: toCamelCase(key),
    value,
    secret,
    confidence: "low",
    rank: 10,
    keepOriginalAlias: false,
  };
}

export function isSecretKeyName(upperKey: string): boolean {
  if (isPublicPublishableKey(upperKey)) return false;
  return SECRET_KEY_RE.test(upperKey);
}

function isPublicPublishableKey(upperKey: string): boolean {
  return PUBLIC_KEY_SUFFIXES.some((s) => upperKey.endsWith(s));
}

export function looksLikeCredentialUrl(value: string): boolean {
  // scheme://user:pass@host
  return /^[a-z][a-z0-9+.-]*:\/\/[^/\s:]+:[^/\s@]+@/i.test(value);
}

export function normalizeUrlCandidate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v.replace(/\/$/, "") || v;
  if (v.startsWith("//")) return `http:${v}`.replace(/\/$/, "");
  if (/^localhost(:\d+)?(\/|$)/i.test(v) || /^\d+\.\d+\.\d+\.\d+(:\d+)?(\/|$)/.test(v)) {
    return `http://${v}`.replace(/\/$/, "");
  }
  // Bare host without scheme — only accept if it looks like a host
  if (/^[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(v) && v.includes(".")) {
    return `https://${v}`.replace(/\/$/, "");
  }
  return null;
}

/** SCREAMING_SNAKE or kebab → camelCase (DATABASE_URL → databaseUrl). */
export function toCamelCase(key: string): string {
  const parts = key.split(/[_-]+/).filter(Boolean);
  if (parts.length === 0) return key;
  return parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}
