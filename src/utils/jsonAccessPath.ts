/**
 * Build a JS-style access path for a JSON tree node, prefixed for scripts
 * that assign `const data = fm.response.json()`.
 *
 * Example: keys `["data", "accessToken"]` → `data.data.accessToken`
 */
export function formatJsonAccessPath(
  keys: readonly (string | number)[],
  root = "data",
): string {
  let path = root;
  for (const key of keys) {
    path += formatPathSegment(key);
  }
  return path;
}

function formatPathSegment(key: string | number): string {
  if (typeof key === "number") {
    return `[${key}]`;
  }
  if (/^\d+$/.test(key)) {
    return `[${key}]`;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return `.${key}`;
  }
  return `[${JSON.stringify(key)}]`;
}
