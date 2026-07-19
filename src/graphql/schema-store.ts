import type { GraphQLDocsModel, GraphQLSchemaCacheEntry } from "./types";

const cache = new Map<string, GraphQLSchemaCacheEntry>();

/** Default TTL: 30 minutes. */
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export function schemaCacheKey(
  endpoint: string,
  authFingerprint = "",
): string {
  return `${endpoint.trim()}::${authFingerprint}`;
}

export function getCachedSchema(
  key: string,
  ttlMs = DEFAULT_TTL_MS,
): GraphQLSchemaCacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedSchema(
  key: string,
  data: {
    endpoint: string;
    docs: GraphQLDocsModel;
    schemaJson: unknown;
    typeCount: number;
  },
): GraphQLSchemaCacheEntry {
  const entry: GraphQLSchemaCacheEntry = {
    endpoint: data.endpoint,
    fetchedAt: Date.now(),
    typeCount: data.typeCount,
    docs: data.docs,
    schemaJson: data.schemaJson,
  };
  cache.set(key, entry);
  return entry;
}

export function invalidateSchemaCache(key?: string): void {
  if (key) {
    cache.delete(key);
    return;
  }
  cache.clear();
}

/** Test helper. */
export function _resetSchemaCacheForTests(): void {
  cache.clear();
}
