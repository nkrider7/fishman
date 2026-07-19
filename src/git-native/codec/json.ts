import { GitNativeError } from "../errors";

/**
 * Deterministic JSON for Git-friendly diffs.
 * - Deep-sorted object keys
 * - headers / query / variables arrays sorted by `key`
 * - 4-space indent, trailing newline, LF only
 */
const ARRAY_SORT_KEYS = new Set(["headers", "query", "variables"]);

function sortKvArray(arr: unknown[]): unknown[] {
  return [...arr].sort((a, b) => {
    const ak =
      a && typeof a === "object" && "key" in a
        ? String((a as { key: unknown }).key)
        : "";
    const bk =
      b && typeof b === "object" && "key" in b
        ? String((b as { key: unknown }).key)
        : "";
    return ak.localeCompare(bk);
  });
}

export function canonicalize(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    if (parentKey && ARRAY_SORT_KEYS.has(parentKey)) {
      return sortKvArray(items);
    }
    return items;
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort((a, b) => a.localeCompare(b))) {
      const v = input[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v, key);
    }
    return out;
  }
  return value;
}

/** Pretty-print JSON with stable key order and LF endings. */
export function serializeJson(value: unknown): string {
  const text = JSON.stringify(canonicalize(value), null, 4);
  return `${text.replace(/\r\n/g, "\n")}\n`;
}

export function parseJson(text: string, path?: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new GitNativeError("INVALID_DOCUMENT", "Failed to parse JSON", {
      path,
      cause,
    });
  }
}
