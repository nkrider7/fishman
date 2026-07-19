/** Shell single-quoted string (safe for bash). */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Escape for double-quoted shell strings. */
export function shellDoubleEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

export function jsString(value: string): string {
  return JSON.stringify(value);
}

export function pythonString(value: string): string {
  return JSON.stringify(value);
}

export function goString(value: string): string {
  return JSON.stringify(value);
}

export function javaString(value: string): string {
  return JSON.stringify(value);
}

export function csharpString(value: string): string {
  return JSON.stringify(value);
}

export function phpString(value: string): string {
  return JSON.stringify(value);
}

export function rubyString(value: string): string {
  return JSON.stringify(value);
}

export function rustString(value: string): string {
  return JSON.stringify(value);
}

export function indent(lines: string[], spaces = 2): string {
  const pad = " ".repeat(spaces);
  return lines.map((l) => (l ? pad + l : l)).join("\n");
}
