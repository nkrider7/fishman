import type { OpenVariableMatch } from "./types";

/**
 * Detect an incomplete `{{…` variable token at the caret.
 * Returns null when there is no open brace pair to complete.
 */
export function detectOpenVariable(
  text: string,
  caret: number,
): OpenVariableMatch | null {
  if (caret < 0 || caret > text.length) return null;

  const before = text.slice(0, caret);
  const openStart = before.lastIndexOf("{{");
  if (openStart === -1) return null;

  const afterOpen = before.slice(openStart + 2);

  // Already closed before the caret — not an open token.
  if (afterOpen.includes("}}")) return null;

  // Nested `{` or newline ends the candidate.
  if (/[\n{]/.test(afterOpen)) return null;

  let replaceEnd = caret;
  if (text.slice(caret, caret + 2) === "}}") {
    replaceEnd = caret + 2;
  }

  return {
    openStart,
    queryStart: openStart + 2,
    query: afterOpen,
    caret,
    replaceEnd,
  };
}

/**
 * True when the last edit likely opened or is editing a `{{` token.
 * Used to open the menu without an explicit caret read on every key.
 */
export function shouldOfferSuggestions(
  text: string,
  caret: number,
): boolean {
  return detectOpenVariable(text, caret) !== null;
}
