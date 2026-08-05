/** Minimal YAML emitter for OpenCollection docs payloads (no js-yaml dependency). */

function escapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function formatScalar(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  // Prefer double quotes for URLs, templates, and anything non-plain.
  if (
    value === "" ||
    /[:#{}[\],&*?|<>=!%@`'"\\]/.test(value) ||
    value.includes("{{") ||
    value.includes("\n") ||
    /^(true|false|null|~)$/i.test(value) ||
    /^\d/.test(value)
  ) {
    if (value.includes("\n")) {
      return null as unknown as string; // signal block
    }
    return `"${escapeDoubleQuoted(value)}"`;
  }
  return value;
}

function dumpLines(value: unknown, indent: number): string[] {
  const pad = "  ".repeat(indent);

  if (value === undefined) return [];
  if (value === null) return [`${pad}null`];

  if (typeof value === "string") {
    if (value.includes("\n")) {
      const rows = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      return [`${pad}|-`, ...rows.map((r) => `${pad}  ${r}`)];
    }
    const formatted = formatScalar(value);
    return [`${pad}${formatted}`];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [`${pad}${formatScalar(value)}`];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`];
    const out: string[] = [];
    for (const item of value) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>).filter(
          ([, v]) => v !== undefined,
        );
        if (entries.length === 0) {
          out.push(`${pad}- {}`);
          continue;
        }
        const [firstKey, firstVal] = entries[0]!;
        const firstLines = dumpLines(firstVal, 0);
        if (firstLines.length === 1 && !String(firstLines[0]).includes("\n")) {
          out.push(`${pad}- ${firstKey}: ${firstLines[0]!.trimStart()}`);
        } else {
          out.push(`${pad}- ${firstKey}:`);
          out.push(...dumpLines(firstVal, indent + 2));
        }
        for (const [key, val] of entries.slice(1)) {
          out.push(...dumpKey(key, val, indent + 1));
        }
      } else {
        const scalarLines = dumpLines(item, 0);
        out.push(`${pad}- ${scalarLines[0]!.trimStart()}`);
      }
    }
    return out;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    if (entries.length === 0) return [`${pad}{}`];
    const out: string[] = [];
    for (const [key, val] of entries) {
      out.push(...dumpKey(key, val, indent));
    }
    return out;
  }

  return [`${pad}${JSON.stringify(String(value))}`];
}

function dumpKey(key: string, value: unknown, indent: number): string[] {
  const pad = "  ".repeat(indent);
  if (value === undefined) return [];
  if (value === null) return [`${pad}${key}: null`];

  if (typeof value === "string") {
    if (value.includes("\n")) {
      return [`${pad}${key}:`, ...dumpLines(value, indent + 1)];
    }
    return [`${pad}${key}: ${formatScalar(value)}`];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [`${pad}${key}: ${formatScalar(value)}`];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${key}: []`];
    return [`${pad}${key}:`, ...dumpLines(value, indent + 1)];
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return [`${pad}${key}: {}`];
    return [`${pad}${key}:`, ...dumpLines(value, indent + 1)];
  }
  return [`${pad}${key}: ${JSON.stringify(String(value))}`];
}

export function dumpOpenCollectionYaml(doc: unknown): string {
  return `${dumpLines(doc, 0).join("\n")}\n`;
}

/** Escape a YAML string for embedding inside a JS double-quoted string literal. */
export function escapeYamlForJsString(yaml: string): string {
  return JSON.stringify(yaml).replace(/<\//g, "<\\/");
}
