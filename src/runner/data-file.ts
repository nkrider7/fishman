export type IterationRow = Record<string, unknown>;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parseCsvDataFile(content: string): IterationRow[] {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: IterationRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: IterationRow = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = cells[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

export function parseJsonDataFile(content: string): IterationRow[] {
  const parsed: unknown = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON data file must be an array of objects");
  }
  return parsed.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`JSON data row ${index} must be an object`);
    }
    return row as IterationRow;
  });
}

export function parseDataFile(
  content: string,
  filename: string,
): IterationRow[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) {
    return parseJsonDataFile(content);
  }
  if (lower.endsWith(".csv")) {
    return parseCsvDataFile(content);
  }
  // Try JSON first, then CSV
  try {
    return parseJsonDataFile(content);
  } catch {
    return parseCsvDataFile(content);
  }
}

/**
 * Resolve how many iterations to run given config N and optional data rows.
 * - No data file: N iterations (min 1)
 * - Data file + N: min(N, rows) when N > 0, else all rows
 */
export function resolveIterationRows(
  iterations: number,
  dataRows?: IterationRow[],
): IterationRow[] {
  if (dataRows && dataRows.length > 0) {
    if (!iterations || iterations <= 0) return dataRows;
    return dataRows.slice(0, Math.min(iterations, dataRows.length));
  }
  const count = Math.max(1, iterations || 1);
  return Array.from({ length: count }, () => ({}));
}
