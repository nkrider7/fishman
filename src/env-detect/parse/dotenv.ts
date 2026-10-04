/**
 * Parse dotenv-style KEY=VALUE content.
 * Handles comments, optional `export`, single/double quotes.
 * Skips multiline values (unsupported in Phase 1).
 */
export function parseDotEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("export ")) {
      line = line.slice("export ".length).trim();
    }

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();

    // Inline comment for unquoted values: FOO=bar # comment
    if (
      value &&
      !value.startsWith('"') &&
      !value.startsWith("'") &&
      value.includes(" #")
    ) {
      value = value.slice(0, value.indexOf(" #")).trimEnd();
    }

    value = unquote(value);
    env[key] = value;
  }

  return env;
}

function unquote(value: string): string {
  if (value.length < 2) return value;
  const q = value[0];
  if ((q === '"' || q === "'") && value[value.length - 1] === q) {
    const inner = value.slice(1, -1);
    if (q === '"') {
      return inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return inner;
  }
  return value;
}
