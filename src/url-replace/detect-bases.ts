import { extractOrigin } from "./replace-urls";
import type { DetectedBase } from "./types";

/**
 * Rank URL origins by frequency across a list of URL strings.
 * Skips template URLs and unparseable values.
 */
export function detectBases(
  urls: string[],
  options?: { limit?: number },
): DetectedBase[] {
  const limit = options?.limit ?? 3;
  const counts = new Map<string, { origin: string; count: number }>();

  for (const raw of urls) {
    const origin = extractOrigin(raw);
    if (!origin) continue;
    const key = origin.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { origin, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin))
    .slice(0, limit);
}

/**
 * Collect candidate URL strings from mixed sources for detection.
 */
export function collectUrlsForDetection(input: {
  requestUrls: string[];
  folderBaseUrls?: Array<string | undefined | null>;
  envValues?: string[];
}): string[] {
  const out: string[] = [...input.requestUrls];
  for (const b of input.folderBaseUrls ?? []) {
    if (b) out.push(b);
  }
  for (const v of input.envValues ?? []) {
    if (v) out.push(v);
  }
  return out;
}
