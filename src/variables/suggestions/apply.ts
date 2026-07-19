import type { ApplySuggestionResult, OpenVariableMatch, VariableSuggestion } from "./types";

/**
 * Replace the open `{{query` token with `{{name}}` and return the new value + caret.
 */
export function applySuggestion(
  text: string,
  match: OpenVariableMatch,
  suggestion: VariableSuggestion,
): ApplySuggestionResult {
  const insertion = `{{${suggestion.name}}}`;
  const value =
    text.slice(0, match.openStart) + insertion + text.slice(match.replaceEnd);
  const caret = match.openStart + insertion.length;
  return { value, caret };
}
