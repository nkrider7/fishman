import type { RunnerQueueItem } from "./types";

function normalizeTagList(raw: string[] | string): string[] {
  const list = Array.isArray(raw)
    ? raw
    : raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
  return list.map((t) => t.toLowerCase());
}

/**
 * Include: item must have at least one include tag (if include list non-empty).
 * Exclude: item must not have any exclude tag.
 */
export function filterQueueByTags(
  items: RunnerQueueItem[],
  includeTags: string[],
  excludeTags: string[],
): RunnerQueueItem[] {
  const include = normalizeTagList(includeTags);
  const exclude = normalizeTagList(excludeTags);

  return items.filter((item) => {
    const tags = item.tags.map((t) => t.toLowerCase());
    if (exclude.length > 0 && tags.some((t) => exclude.includes(t))) {
      return false;
    }
    if (include.length > 0 && !tags.some((t) => include.includes(t))) {
      return false;
    }
    return true;
  });
}

export function parseTagInput(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
