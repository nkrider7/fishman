import type { VariableSuggestion } from "./types";

function scoreMatch(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 50;
  // Match without leading $ for dynamic vars.
  if (n.startsWith("$") && n.slice(1).startsWith(q)) return 70;
  if (n.startsWith("$") && n.slice(1).includes(q)) return 40;
  return -1;
}

/**
 * Filter + rank suggestions for the typed query after `{{`.
 * Empty query returns the full catalog (env first — already ordered).
 */
export function filterSuggestions(
  catalog: VariableSuggestion[],
  query: string,
  limit = 80,
): VariableSuggestion[] {
  const q = query.trim();
  if (!q) {
    // Prefer environment/folder before a long dynamic list when browsing.
    const env = catalog.filter((s) => s.kind !== "dynamic");
    const dyn = catalog.filter((s) => s.kind === "dynamic");
    return [...env, ...dyn].slice(0, limit);
  }

  const ranked: Array<{ item: VariableSuggestion; score: number }> = [];
  for (const item of catalog) {
    const score = scoreMatch(item.name, q);
    if (score < 0) continue;
    // Slight boost so env/folder beat equally matching dynamics.
    const kindBoost =
      item.kind === "environment" ? 3 : item.kind === "folder" ? 2 : 0;
    ranked.push({ item, score: score + kindBoost });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.name.localeCompare(b.item.name);
  });

  return ranked.slice(0, limit).map((r) => r.item);
}
