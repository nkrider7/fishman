import type { Monaco } from "@monaco-editor/react";
import type { editor, IDisposable, languages, Position } from "monaco-editor";
import { detectOpenVariable } from "./detect";
import { filterSuggestions } from "./filter";
import type { VariableSuggestion } from "./types";

export type VariableCatalogGetter = () => VariableSuggestion[];

/** Latest catalog getter from any mounted React hook (env changes stay live). */
let sharedCatalogGetter: VariableCatalogGetter = () => [];

/**
 * Bump when the provider implementation changes so HMR / long-lived apps
 * re-register instead of keeping a stale singleton.
 */
const PROVIDER_VERSION = 2;
let registeredProviderVersion = 0;

const registeredLanguages = new Set<string>();
const languageDisposables = new Map<string, IDisposable>();

export function setSharedMonacoVariableCatalog(
  getter: VariableCatalogGetter,
): void {
  sharedCatalogGetter = getter;
}

function kindFor(
  monaco: Monaco,
  kind: VariableSuggestion["kind"],
): languages.CompletionItemKind {
  switch (kind) {
    case "dynamic":
      return monaco.languages.CompletionItemKind.Constant;
    case "folder":
      return monaco.languages.CompletionItemKind.Field;
    default:
      return monaco.languages.CompletionItemKind.Variable;
  }
}

function clearLanguageProviders(): void {
  for (const disposable of languageDisposables.values()) {
    disposable.dispose();
  }
  languageDisposables.clear();
  registeredLanguages.clear();
}

/**
 * Ensures a single completion provider per language (safe across many editors).
 */
export function ensureMonacoVariableCompletions(
  monaco: Monaco,
  language: string,
): void {
  if (registeredProviderVersion !== PROVIDER_VERSION) {
    clearLanguageProviders();
    registeredProviderVersion = PROVIDER_VERSION;
  }

  if (registeredLanguages.has(language)) return;
  registeredLanguages.add(language);

  const disposable = monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ["{", "$"],
    provideCompletionItems(
      model: editor.ITextModel,
      position: Position,
    ): languages.ProviderResult<languages.CompletionList> {
      const offset = model.getOffsetAt(position);
      const value = model.getValue();
      const match = detectOpenVariable(value, offset);
      if (!match) {
        return { suggestions: [] };
      }

      const items = filterSuggestions(sharedCatalogGetter(), match.query);
      if (items.length === 0) {
        return { suggestions: [] };
      }

      const start = model.getPositionAt(match.openStart);
      const end = model.getPositionAt(match.replaceEnd);

      const range: languages.CompletionItem["range"] = {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      };

      // Typed text in the replace range is `{{` / `{{query`. Monaco filters
      // suggestions against that prefix, so filterText must start with `{{`.
      return {
        incomplete: true,
        suggestions: items.map((item, index) => {
          const insertion = `{{${item.name}}}`;
          return {
            label: {
              label: item.name,
              description: item.sourceLabel,
            },
            kind: kindFor(monaco, item.kind),
            detail: item.detail ?? item.sourceLabel,
            documentation: item.detail
              ? `${item.sourceLabel}: ${item.detail}`
              : item.sourceLabel,
            insertText: insertion,
            range,
            // Lead with "0" so we sort above random JS built-ins.
            sortText: `0_${String(index).padStart(4, "0")}_${item.name}`,
            filterText: `{{${item.name}`,
            preselect: index === 0,
          };
        }),
      };
    },
  });

  languageDisposables.set(language, disposable);
}

export function ensureMonacoVariableCompletionsForLanguages(
  monaco: Monaco,
  languagesList: string[],
): void {
  for (const language of languagesList) {
    ensureMonacoVariableCompletions(monaco, language);
  }
}

/**
 * Re-opens Monaco suggest when the caret is inside an open `{{…` token.
 * Needed because the first `{` often opens an empty suggest widget that
 * does not refresh after the second `{`.
 */
export function bindMonacoVariableSuggestTrigger(
  editorInstance: editor.IStandaloneCodeEditor,
): IDisposable {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const disposeContent = editorInstance.onDidChangeModelContent(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const model = editorInstance.getModel();
      if (!model) return;
      const position = editorInstance.getPosition();
      if (!position) return;
      const offset = model.getOffsetAt(position);
      if (!detectOpenVariable(model.getValue(), offset)) return;

      editorInstance.trigger(
        "fishman-variables",
        "editor.action.triggerSuggest",
        {},
      );
    }, 0);
  });

  return {
    dispose: () => {
      if (timer) clearTimeout(timer);
      disposeContent.dispose();
    },
  };
}

/** @deprecated prefer ensureMonacoVariableCompletions */
export function registerMonacoVariableCompletions(
  monaco: Monaco,
  language: string,
  getCatalog: VariableCatalogGetter,
): IDisposable {
  setSharedMonacoVariableCatalog(getCatalog);
  ensureMonacoVariableCompletions(monaco, language);
  return { dispose: () => undefined };
}

export function registerMonacoVariableCompletionsForLanguages(
  monaco: Monaco,
  languagesList: string[],
  getCatalog: VariableCatalogGetter,
): IDisposable {
  setSharedMonacoVariableCatalog(getCatalog);
  ensureMonacoVariableCompletionsForLanguages(monaco, languagesList);
  return { dispose: () => undefined };
}
