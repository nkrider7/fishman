import type { Monaco } from "@monaco-editor/react";

let registered = false;

/**
 * Monaco ships without a first-class GraphQL tokenizer in all builds.
 * Register a lightweight Monarch grammar once so editors get highlighting.
 */
export function ensureGraphQLMonacoLanguage(monaco: Monaco): void {
  if (registered) return;
  const languages = monaco.languages.getLanguages();
  if (languages.some((l: { id: string }) => l.id === "graphql")) {
    registered = true;
    return;
  }

  monaco.languages.register({ id: "graphql", extensions: [".graphql", ".gql"] });
  monaco.languages.setMonarchTokensProvider("graphql", {
    keywords: [
      "query",
      "mutation",
      "subscription",
      "fragment",
      "on",
      "true",
      "false",
      "null",
      "schema",
      "extend",
      "scalar",
      "type",
      "interface",
      "union",
      "enum",
      "input",
      "directive",
      "implements",
      "repeatable",
    ],
    typeKeywords: [
      "Int",
      "Float",
      "String",
      "Boolean",
      "ID",
    ],
    operators: ["=", "!", ":", "$", "&", "|", "..."],
    symbols: /[=!:$&|]+/,
    escapes: /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/,
    tokenizer: {
      root: [
        [/[a-zA-Z_][\w]*/, {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@default": "identifier",
          },
        }],
        [/[{}()\[\]]/, "@brackets"],
        [/@symbols/, "operator"],
        [/#.*$/, "comment"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
        [/\d+/, "number"],
        [/\$[a-zA-Z_][\w]*/, "variable"],
        [/@[a-zA-Z_][\w]*/, "annotation"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
    },
  });

  registered = true;
}
