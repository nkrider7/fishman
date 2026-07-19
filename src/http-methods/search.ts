/**
 * Workspace search helpers.
 * Supports free-text and `method:QUERY` style filters.
 */

export interface MethodSearchMatch {
  /** Normalized method filter if present, e.g. "QUERY" */
  methodFilter: string | null;
  /** Remaining free-text query */
  textQuery: string;
}

export function parseMethodSearch(raw: string): MethodSearchMatch {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { methodFilter: null, textQuery: "" };
  }

  const methodMatch = trimmed.match(/(?:^|\s)method:(\S+)/i);
  if (!methodMatch) {
    return { methodFilter: null, textQuery: trimmed.toLowerCase() };
  }

  const methodFilter = methodMatch[1].toUpperCase();
  const textQuery = trimmed
    .replace(methodMatch[0], " ")
    .trim()
    .toLowerCase();

  return { methodFilter, textQuery };
}

export function matchesMethodSearch(
  method: string,
  name: string,
  url: string,
  rawQuery: string,
): boolean {
  const { methodFilter, textQuery } = parseMethodSearch(rawQuery);
  if (methodFilter && method.toUpperCase() !== methodFilter) {
    return false;
  }
  if (!textQuery) return true;
  return (
    name.toLowerCase().includes(textQuery) ||
    url.toLowerCase().includes(textQuery) ||
    method.toLowerCase().includes(textQuery)
  );
}
