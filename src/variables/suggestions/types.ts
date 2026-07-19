export type VariableSuggestionKind = "environment" | "folder" | "dynamic";

export interface VariableSuggestion {
  /** Stable id for React keys / selection. */
  id: string;
  /** Variable name without braces, e.g. `baseUrl` or `$uuid`. */
  name: string;
  kind: VariableSuggestionKind;
  /** Short preview of the current value (env) or description (dynamic). */
  detail?: string;
  /** Human label for the source column. */
  sourceLabel: string;
}

export interface OpenVariableMatch {
  /** Index of the opening `{{`. */
  openStart: number;
  queryStart: number;
  /** Text typed after `{{` up to the caret. */
  query: string;
  caret: number;
  /** Exclusive end of the span replaced on accept (includes trailing `}}` if present). */
  replaceEnd: number;
}

export interface ApplySuggestionResult {
  value: string;
  /** Caret position after insertion (after closing `}}`). */
  caret: number;
}
