import { classifyEnvPair } from "./classify";
import type {
  DetectConfidence,
  DetectedVariable,
  DetectSourceKind,
  DetectSourceRef,
} from "./types";

export interface RawEnvPair {
  key: string;
  value: string;
  source: DetectSourceRef;
}

/**
 * Turn raw KEY=VALUE pairs into Fishman variable proposals.
 * Competing `baseUrl` / `token` candidates: keep the highest-rank winner enabled;
 * demote others to disabled aliases when keepOriginalAlias applies.
 */
export function suggestVariables(pairs: RawEnvPair[]): DetectedVariable[] {
  const classified: Array<{
    pair: RawEnvPair;
    fishKey: string;
    value: string;
    secret: boolean;
    confidence: DetectConfidence;
    rank: number;
    keepOriginalAlias: boolean;
  }> = [];

  for (const pair of pairs) {
    const result = classifyEnvPair(pair.key, pair.value);
    if (!result) continue;
    classified.push({
      pair,
      fishKey: result.key,
      value: result.value,
      secret: result.secret,
      confidence: result.confidence,
      rank: result.rank,
      keepOriginalAlias: result.keepOriginalAlias,
    });
  }

  // Pick winners for canonical keys that should be unique.
  const winners = new Map<string, (typeof classified)[number]>();
  for (const row of classified) {
    if (row.fishKey !== "baseUrl" && row.fishKey !== "token") continue;
    const prev = winners.get(row.fishKey);
    if (!prev || row.rank > prev.rank) {
      winners.set(row.fishKey, row);
    }
  }

  const out: DetectedVariable[] = [];
  const seenIds = new Set<string>();

  const push = (v: DetectedVariable) => {
    if (seenIds.has(v.id)) return;
    seenIds.add(v.id);
    out.push(v);
  };

  for (const row of classified) {
    const isCanonical = row.fishKey === "baseUrl" || row.fishKey === "token";
    const winner = isCanonical ? winners.get(row.fishKey) : undefined;
    const isWinner = !isCanonical || winner === row;

    if (isWinner) {
      push({
        id: makeId(row.pair.source, row.fishKey, row.pair.key),
        key: row.fishKey,
        value: row.value,
        secret: row.secret,
        enabled: true,
        confidence: row.confidence,
        source: {
          ...row.pair.source,
          originalKey: row.pair.key,
          evidence: evidenceFor(row.pair),
        },
      });

      if (
        row.keepOriginalAlias &&
        toSafeAliasKey(row.pair.key) !== row.fishKey
      ) {
        const aliasKey = toSafeAliasKey(row.pair.key);
        push({
          id: makeId(row.pair.source, aliasKey, row.pair.key) + ":alias",
          key: aliasKey,
          value: row.pair.value,
          secret: row.secret,
          enabled: false,
          confidence: "low",
          source: {
            ...row.pair.source,
            originalKey: row.pair.key,
            evidence: `alias of ${row.fishKey}`,
          },
          aliasOf: row.fishKey,
        });
      }
    } else if (row.keepOriginalAlias) {
      // Losing baseUrl/token candidate — keep original as disabled alias.
      const aliasKey = toSafeAliasKey(row.pair.key);
      push({
        id: makeId(row.pair.source, aliasKey, row.pair.key) + ":loser",
        key: aliasKey,
        value: row.pair.value,
        secret: row.secret,
        enabled: false,
        confidence: "low",
        source: {
          ...row.pair.source,
          originalKey: row.pair.key,
          evidence: `also detected; preferred ${row.fishKey} from higher-confidence source`,
        },
        aliasOf: row.fishKey,
      });
    }
  }

  // Stable sort: high confidence first, then key.
  const order: Record<DetectConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  out.sort((a, b) => {
    const c = order[a.confidence] - order[b.confidence];
    if (c !== 0) return c;
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  return out;
}

function evidenceFor(pair: RawEnvPair): string {
  if (pair.source.evidence) return pair.source.evidence;
  const preview =
    pair.value.length > 24 ? `${pair.value.slice(0, 21)}…` : pair.value;
  // Never put secret-looking values in evidence.
  if (/(secret|token|password|key)/i.test(pair.key)) {
    return `${pair.key}=***`;
  }
  return `${pair.key}=${preview}`;
}

function toSafeAliasKey(originalKey: string): string {
  const parts = originalKey.split(/[_-]+/).filter(Boolean);
  if (parts.length === 0) return originalKey.toLowerCase();
  return parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function makeId(
  source: DetectSourceRef,
  fishKey: string,
  originalKey: string,
): string {
  return `${source.kind}:${source.path}:${fishKey}:${originalKey}`;
}

export function sourceKindLabel(kind: DetectSourceKind): string {
  switch (kind) {
    case "dotenv":
      return ".env";
    case "docker-compose":
      return "Compose";
    case "k8s":
      return "Kubernetes";
    case "package-json":
      return "package.json";
    case "heuristic":
      return "Heuristic";
  }
}
