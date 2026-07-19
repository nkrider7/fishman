export type {
  ApplySuggestionResult,
  OpenVariableMatch,
  VariableSuggestion,
  VariableSuggestionKind,
} from "./types";
export { detectOpenVariable, shouldOfferSuggestions } from "./detect";
export {
  buildSuggestionCatalog,
  buildEnvironmentSuggestions,
  buildFolderSuggestions,
  buildDynamicSuggestions,
} from "./catalog";
export { filterSuggestions } from "./filter";
export { applySuggestion } from "./apply";
export {
  registerMonacoVariableCompletions,
  registerMonacoVariableCompletionsForLanguages,
  ensureMonacoVariableCompletions,
  ensureMonacoVariableCompletionsForLanguages,
  setSharedMonacoVariableCatalog,
  bindMonacoVariableSuggestTrigger,
  type VariableCatalogGetter,
} from "./monaco";

