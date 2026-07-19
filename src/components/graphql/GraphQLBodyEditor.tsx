import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minimize2, Sparkles } from "lucide-react";
import { parse, print } from "graphql";
import { useAppDispatch } from "@/hooks/redux";
import { useMonacoVariableCompletions } from "@/hooks/useMonacoVariableCompletions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraphQLOperationSelect } from "@/components/graphql/GraphQLOperationSelect";
import { GraphQLSchemaToolbar } from "@/components/graphql/GraphQLSchemaToolbar";
import { GraphQLDocsSidebar } from "@/components/graphql/GraphQLDocsSidebar";
import { fetchGraphQLSchemaThunk } from "@/store/thunks/fetchGraphQLSchema";
import {
  createDefaultGraphQLConfig,
  ensureGraphQLConfig,
  ensureGraphQLMonacoLanguage,
  getCachedSchema,
  registerGraphQLCompletions,
  schemaCacheKey,
  tryParseVariablesObject,
  type GraphQLConfig,
  type GraphQLSchemaCacheEntry,
} from "@/graphql";
import type { RequestDraft } from "@/types/request";
import { withGraphQLConfig } from "@/types/request";
import { minifyJson, tryFormatJson } from "@/utils/requestBuilder";

interface GraphQLBodyEditorProps {
  tabId: string;
  draft: RequestDraft;
  editorTheme: "vs-dark" | "light";
  onChange: (changes: Partial<RequestDraft>) => void;
}

export function GraphQLBodyEditor({
  tabId,
  draft,
  editorTheme,
  onChange,
}: GraphQLBodyEditorProps) {
  const dispatch = useAppDispatch();
  const { enhanceOnMount } = useMonacoVariableCompletions(draft.collectionId);
  const queryEditorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const [panel, setPanel] = useState<"query" | "variables">("query");
  const [docsOpen, setDocsOpen] = useState(true);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schema, setSchema] = useState<GraphQLSchemaCacheEntry | null>(null);

  const graphql = useMemo(
    () => ensureGraphQLConfig(draft) ?? createDefaultGraphQLConfig(""),
    [draft],
  );

  const variablesCheck = tryParseVariablesObject(graphql.variables);

  useEffect(() => {
    if (draft.bodyType === "graphql" && !draft.graphql) {
      onChange(withGraphQLConfig(draft, graphql));
    }
    // Hydrate once when entering GraphQL without structured config
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.bodyType]);

  const updateGraphql = useCallback(
    (patch: Partial<GraphQLConfig>) => {
      onChange(withGraphQLConfig(draft, { ...graphql, ...patch }));
    },
    [draft, graphql, onChange],
  );

  const cacheKey = schemaCacheKey(draft.url || "", draft.auth.type);

  useEffect(() => {
    const cached = getCachedSchema(cacheKey);
    if (cached) setSchema(cached);
  }, [cacheKey]);

  useEffect(() => {
    if (monacoRef.current && schema?.docs) {
      registerGraphQLCompletions(monacoRef.current, schema.docs);
    }
  }, [schema]);

  const handleFetchSchema = async () => {
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const entry = await dispatch(fetchGraphQLSchemaThunk(tabId)).unwrap();
      setSchema(entry);
      updateGraphql({ schemaSource: "introspection" });
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : String(e));
    } finally {
      setSchemaLoading(false);
    }
  };

  const queryOnMount = useMemo(
    () =>
      enhanceOnMount(["graphql", "plaintext"], (editor, monaco) => {
        ensureGraphQLMonacoLanguage(monaco);
        queryEditorRef.current = editor;
        monacoRef.current = monaco;
        if (schema?.docs) {
          registerGraphQLCompletions(monaco, schema.docs);
        }
      }),
    [enhanceOnMount, schema?.docs],
  );

  const variablesOnMount = useMemo(
    () => enhanceOnMount(["json"]),
    [enhanceOnMount],
  );

  const formatQuery = () => {
    try {
      updateGraphql({ query: print(parse(graphql.query)) });
    } catch {
      /* keep editor content on parse failure */
    }
  };

  const formatVariables = () => {
    const formatted = tryFormatJson(graphql.variables);
    if (formatted !== graphql.variables) updateGraphql({ variables: formatted });
  };

  const minifyVariables = () => {
    const minified = minifyJson(graphql.variables);
    if (minified !== graphql.variables) updateGraphql({ variables: minified });
  };

  const insertAtCursor = (text: string) => {
    const editor = queryEditorRef.current;
    if (!editor) {
      updateGraphql({
        query: graphql.query ? `${graphql.query.trimEnd()}\n${text}` : text,
      });
      return;
    }
    const selection = editor.getSelection();
    if (selection) {
      editor.executeEdits("fishman-graphql-insert", [
        { range: selection, text, forceMoveMarkers: true },
      ]);
      updateGraphql({ query: editor.getValue() });
      editor.focus();
    }
  };

  const methodHint =
    draft.method === "GET" || draft.method === "HEAD"
      ? "GraphQL requests usually use POST."
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {methodHint ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          {methodHint}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <GraphQLOperationSelect
          query={graphql.query}
          operationName={graphql.operationName}
          onChange={(operationName) => updateGraphql({ operationName })}
        />
        <GraphQLSchemaToolbar
          schema={schema}
          loading={schemaLoading}
          error={schemaError}
          docsOpen={docsOpen}
          onFetch={() => void handleFetchSchema()}
          onToggleDocs={() => setDocsOpen((o) => !o)}
        />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border/60">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Tabs
            value={panel}
            onValueChange={(v) => setPanel(v as "query" | "variables")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-2 py-1">
              <TabsList className="h-8">
                <TabsTrigger value="query" className="text-xs">
                  Query
                </TabsTrigger>
                <TabsTrigger value="variables" className="text-xs">
                  Variables
                  {!variablesCheck.ok ? (
                    <span className="ml-1 text-destructive">!</span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-1">
                {panel === "query" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={formatQuery}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Format
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={formatVariables}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Beautify
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={minifyVariables}
                    >
                      <Minimize2 className="h-3.5 w-3.5" />
                      Minify
                    </Button>
                  </>
                )}
              </div>
            </div>

            <TabsContent
              value="query"
              className="mt-0 min-h-[200px] flex-1 data-[state=inactive]:hidden"
              style={{ height: "100%" }}
            >
              <Editor
                height="100%"
                language="graphql"
                theme={editorTheme}
                value={graphql.query}
                onChange={(v) => updateGraphql({ query: v ?? "" })}
                onMount={queryOnMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </TabsContent>

            <TabsContent
              value="variables"
              className="mt-0 flex min-h-[200px] flex-1 flex-col data-[state=inactive]:hidden"
              style={{ height: "100%" }}
            >
              {!variablesCheck.ok ? (
                <p className="border-b border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
                  Variables must be valid JSON: {variablesCheck.error}
                </p>
              ) : null}
              <div className="min-h-0 flex-1">
                <Editor
                  height="100%"
                  language="json"
                  theme={editorTheme}
                  value={graphql.variables}
                  onChange={(v) => updateGraphql({ variables: v ?? "" })}
                  onMount={variablesOnMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {docsOpen ? (
          <GraphQLDocsSidebar
            docs={schema?.docs ?? null}
            onInsert={insertAtCursor}
          />
        ) : null}
      </div>
    </div>
  );
}
