import type { Monaco } from "@monaco-editor/react";
import type { IDisposable, Position } from "monaco-editor";
import type { GraphQLDocsModel, GraphQLDocField } from "../types";
import { formatTypeRef } from "../docs/flatten";

const providers = new WeakMap<object, IDisposable>();

/**
 * Register simple root-field completions from an introspected docs model.
 * Full language-service validation can be added later without changing this API.
 */
export function registerGraphQLCompletions(
  monaco: Monaco,
  docs: GraphQLDocsModel | null,
): IDisposable | null {
  const existing = providers.get(monaco);
  existing?.dispose();
  providers.delete(monaco);

  if (!docs) return null;

  const allRoot: Array<{ field: GraphQLDocField; kind: string }> = [
    ...docs.queries.map((field) => ({ field, kind: "Query" })),
    ...docs.mutations.map((field) => ({ field, kind: "Mutation" })),
  ];

  const disposable = monaco.languages.registerCompletionItemProvider("graphql", {
    triggerCharacters: [" ", "\n", "{", "("],
    provideCompletionItems(model: { getWordUntilPosition: (p: Position) => { startColumn: number; endColumn: number; word: string } }, position: Position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = allRoot.map(({ field, kind }) => ({
        label: field.name,
        kind: monaco.languages.CompletionItemKind.Field,
        detail: `${kind} · ${formatTypeRef(field.type)}`,
        documentation: field.description ?? undefined,
        insertText: field.name,
        range,
      }));

      // Type names
      for (const t of docs.types.slice(0, 200)) {
        suggestions.push({
          label: t.name,
          kind: monaco.languages.CompletionItemKind.Class,
          detail: t.kind,
          documentation: t.description ?? undefined,
          insertText: t.name,
          range,
        });
      }

      return { suggestions };
    },
  });

  providers.set(monaco, disposable);
  return disposable;
}
