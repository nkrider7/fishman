import Editor from "@monaco-editor/react";
import { useMemo, useRef, useState } from "react";
import { useStore } from "react-redux";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { FormDataEditor } from "@/components/request/FormDataEditor";
import { MethodDocsPanel } from "@/components/request/MethodDocsPanel";
import { MethodWarningsBanner } from "@/components/request/MethodWarningsBanner";
import { QueryTemplates } from "@/components/request/QueryTemplates";
import { ScriptsPanel } from "@/components/request/ScriptsPanel";
import { KeyValueEditor } from "@/components/common/KeyValueEditor";
import { VariableAwareInput } from "@/components/common/VariableAwareInput";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMonacoVariableCompletions } from "@/hooks/useMonacoVariableCompletions";
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { sendRequestThunk } from "@/store/thunks/sendRequest";
import { saveActiveTab } from "@/store/thunks/saveActiveTab";
import { maybeScheduleAutoSaveFromTab } from "@/store/thunks/filesystemAutoSaveThunks";
import type { RootState } from "@/store";
import {
  BODY_TYPES,
  HTTP_METHODS,
  createFormDataField,
  type BodyType,
  type HttpMethod,
} from "@/types/request";
import {
  getMethodDefinition,
  getMethodWarnings,
  suggestQueryMigration,
} from "@/http-methods";
import {
  getMethodClass,
  minifyJson,
  syncParamsFromUrl,
  syncUrlWithParams,
  tryFormatJson,
} from "@/utils/requestBuilder";
import { GenerateCodeDialog } from "@/components/codegen/GenerateCodeDialog";
import { GraphQLBodyEditor } from "@/components/graphql/GraphQLBodyEditor";
import { setApiTestingOpen } from "@/store/slices/uiSlice";
import {
  patchApiTestingConfig,
} from "@/store/slices/apiTestingSlice";
import { configFromActiveRequest } from "@/api-testing";
import { openUrlReplacePanel } from "@/store/thunks/openUrlReplacePanel";
import { selectionToFindPrefill } from "@/url-replace/get-selection-text";
import { Code2, Gauge, Loader2, Minimize2, Save, Send, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";
import {
  createDefaultGraphQLConfig,
  syncGraphQLBody,
} from "@/graphql";
import { withGraphQLConfig } from "@/types/request";

interface RequestBuilderProps {
  tabId: string;
}

export function RequestBuilder({ tabId }: RequestBuilderProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const draft = useAppSelector((s) => s.request.drafts[tabId]);
  const loading = useAppSelector((s) => s.response.loading[tabId]);
  const theme = useAppSelector((s) => s.settings.theme);
  const diskChanged = useAppSelector((s) =>
    s.filesystemSync.diskChangedTabIds.includes(tabId),
  );
  const [codegenOpen, setCodegenOpen] = useState(false);
  const { enhanceOnMount } = useMonacoVariableCompletions(draft?.collectionId);
  const formatBodyRef = useRef<() => boolean>(() => false);

  const bodyLanguage =
    draft?.bodyType === "json"
      ? "json"
      : draft?.bodyType === "xml" || draft?.bodyType === "html"
        ? "xml"
        : "plaintext";

  const bodyOnMount = useMemo(
    () =>
      enhanceOnMount(["json", "xml", "plaintext"], (editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          void dispatch(saveActiveTab(tabId));
        });

        // Shift+Alt+F — Format JSON body (Fishman-aware via tryFormatJson)
        editor.addAction({
          id: "fishman.formatJsonBody",
          label: "Format JSON",
          keybindings: [
            monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
          ],
          contextMenuGroupId: "modification",
          contextMenuOrder: 1.5,
          run: () => {
            formatBodyRef.current();
          },
        });

        editor.addAction({
          id: "fishman.findReplaceUrls",
          label: "Find & Replace URLs…",
          keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH,
          ],
          contextMenuGroupId: "navigation",
          contextMenuOrder: 1.5,
          run: (ed) => {
            const model = ed.getModel();
            const sel = ed.getSelection();
            const raw =
              model && sel && !sel.isEmpty()
                ? model.getValueInRange(sel)
                : "";
            const findPrefill = selectionToFindPrefill(raw);
            void dispatch(
              openUrlReplacePanel(findPrefill ? { findPrefill } : undefined),
            );
          },
        });
      }),
    [enhanceOnMount, dispatch, tabId],
  );

  if (!draft) return null;

  const methodDef = getMethodDefinition(draft.method);
  const hasMethodWarnings =
    getMethodWarnings(draft).length > 0 || Boolean(suggestQueryMigration(draft));

  const markUnsaved = (changes: Parameters<typeof updateDraft>[0]["changes"]) => {
    dispatch(updateDraft({ tabId, changes }));
    dispatch(updateTab({ id: tabId, changes: { unsaved: true } }));
    if (changes.name) {
      dispatch(updateTab({ id: tabId, changes: { title: changes.name } }));
    }
    maybeScheduleAutoSaveFromTab(dispatch, store.getState, tabId);
  };

  const canFormatJson = draft.bodyType === "json";

  const formatJsonBody = (): boolean => {
    if (!canFormatJson) return false;
    const formatted = tryFormatJson(draft.body);
    if (formatted === draft.body) return false;
    markUnsaved({ body: formatted });
    return true;
  };

  const minifyJsonBody = (): boolean => {
    if (!canFormatJson) return false;
    const minified = minifyJson(draft.body);
    if (minified === draft.body) return false;
    markUnsaved({ body: minified });
    return true;
  };

  formatBodyRef.current = formatJsonBody;

  const hasKeyValueContent = (items: { key: string }[]) =>
    items.some((item) => item.key.trim().length > 0);

  const hasParamsContent = hasKeyValueContent(draft.params);
  const hasHeadersContent = hasKeyValueContent(draft.headers);
  const hasBodyContent = draft.bodyType !== "none";
  const hasAuthContent = draft.auth.type !== "none";
  const hasScriptsContent = Boolean(
    draft.scripts?.preRequest?.trim() ||
      draft.scripts?.postResponse?.trim() ||
      draft.scripts?.tests?.trim(),
  );

  const handleSend = () => {
    dispatch(sendRequestThunk(tabId));
  };

  const handleSave = () => {
    dispatch(saveActiveTab(tabId));
  };

  const editorTheme =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "vs-dark"
      : "light";

  return (
    <div className="flex h-full flex-col">
      {diskChanged ? (
        <div className="flex items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
          <span>Disk changed while you have unsaved edits — your draft was kept.</span>
          <button
            type="button"
            className="shrink-0 font-medium underline-offset-2 hover:underline"
            onClick={() => {
              void import("@/store/thunks/filesystemWatcherThunks").then(
                ({ refreshFilesystemFromDisk }) => {
                  // Clear unsaved then reload — user chose disk
                  dispatch(updateTab({ id: tabId, changes: { unsaved: false } }));
                  void dispatch(refreshFilesystemFromDisk());
                },
              );
              void import("@/store/slices/filesystemSyncSlice").then(
                ({ clearDiskChangedTab }) => {
                  dispatch(clearDiskChangedTab(tabId));
                },
              );
            }}
          >
            Reload from disk
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-b p-1">
        <Select
          value={draft.method}
          onValueChange={(v) => markUnsaved({ method: v as HttpMethod })}
        >
          <SelectTrigger
            className={cn("w-[90px] font-semibold", getMethodClass(draft.method))}
            title={methodDef?.tooltip}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((m) => {
              const def = getMethodDefinition(m);
              return (
                <SelectItem
                  key={m}
                  value={m}
                  className={getMethodClass(m)}
                  title={def?.tooltip}
                >
                  {m}
                  
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <div className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-md border border-input bg-transparent shadow-sm transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring">
          <VariableAwareInput
            className="min-w-0 flex-1 rounded-none border-0 shadow-none focus-within:ring-0"
            value={draft.url}
            collectionId={draft.collectionId}
            placeholder="https://api.example.com/endpoint or {{base_url}}/path"
            onChange={(url) =>
              markUnsaved({
                url,
                params: syncParamsFromUrl(url, draft.params),
              })
            }
          />
          <div className="flex shrink-0 items-center gap-0.5 pr-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="API Testing"
              title="API Testing — load & stress tests"
              onClick={() => {
                if (draft) {
                  dispatch(
                    patchApiTestingConfig(
                      configFromActiveRequest({
                        method: draft.method,
                        url: draft.url,
                        headers: draft.headers,
                        params: draft.params,
                        bodyType: draft.bodyType,
                        body:
                          draft.bodyType === "graphql"
                            ? syncGraphQLBody(
                                draft.graphql ??
                                  createDefaultGraphQLConfig(),
                              )
                            : draft.body,
                        authType: draft.auth.type,
                        auth: { ...draft.auth },
                      }),
                    ),
                  );
                }
                dispatch(setApiTestingOpen(true));
              }}
            >
              <Gauge className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="Generate code"
              title="Generate code"
              onClick={() => setCodegenOpen(true)}
            >
              <Code2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="Save"
              title="Save (Ctrl+S)"
              onClick={handleSave}
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button type="button" className="font-semibold" onClick={handleSend} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send
        </Button>
      </div>

      <GenerateCodeDialog
        open={codegenOpen}
        onOpenChange={setCodegenOpen}
        draft={draft}
      />

      {hasMethodWarnings && (
        <div className="space-y-2 border-b px-3 py-2">
          <MethodWarningsBanner draft={draft} onApplySuggestion={markUnsaved} />
        </div>
      )}

      <Tabs defaultValue="params" className="flex flex-1 flex-col overflow-hidden px-3 pb-3">
        <TabsList className="mt-1 h-9 w-full justify-start gap-0 rounded-none border-b border-border/80 bg-transparent p-0">
          {(
            [
              { value: "params", label: "Params", marked: hasParamsContent },
              { value: "headers", label: "Headers", marked: hasHeadersContent },
              { value: "body", label: "Body", marked: hasBodyContent },
              {
                value: "auth",
                label: "Authorization",
                marked: hasAuthContent,
              },
              { value: "scripts", label: "Scripts", marked: hasScriptsContent },
              { value: "docs", label: "Docs", marked: false },
            ] as const
          ).map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "relative -mb-px h-9 flex-none rounded-none border-0 bg-transparent px-3.5 text-[13px] font-semibold shadow-none cursor-pointer",
                "text-muted-foreground/80 transition-colors",
                "hover:text-foreground",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-transparent after:content-['']",
                "data-[state=active]:after:bg-[#49cc90]",
              )}
            >
              {tab.label}
              {tab.marked ? (
                <span className="ml-1 text-amber-500" aria-hidden>
                  *
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="params" className="mt-0 flex-1 overflow-auto pt-3">
          <KeyValueEditor
            items={draft.params}
            onChange={(params) =>
              markUnsaved({
                params,
                url: syncUrlWithParams(draft.url, params),
              })
            }
            keyPlaceholder="Parameter"
            collectionId={draft.collectionId}
          />
        </TabsContent>

        <TabsContent value="headers" className="mt-0 flex-1 overflow-auto pt-3">
          <KeyValueEditor
            items={draft.headers}
            onChange={(headers) => markUnsaved({ headers })}
            keyPlaceholder="Header"
            collectionId={draft.collectionId}
          />
        </TabsContent>

        <TabsContent value="body" className="mt-0 flex flex-1 flex-col gap-3 overflow-hidden pt-3">
          <QueryTemplates draft={draft} onApply={markUnsaved} />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={draft.bodyType}
              onValueChange={(v) => {
                const bodyType = v as BodyType;
                if (
                  bodyType === "form-data" &&
                  (!draft.formDataFields || draft.formDataFields.length === 0)
                ) {
                  markUnsaved({
                    bodyType,
                    formDataFields: [createFormDataField()],
                  });
                } else if (bodyType === "graphql") {
                  const graphql =
                    draft.graphql ?? createDefaultGraphQLConfig();
                  markUnsaved(
                    withGraphQLConfig(draft, graphql, {
                      ensurePostMethod: true,
                    }),
                  );
                } else {
                  markUnsaved({ bodyType });
                }
              }}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BODY_TYPES.map((bt) => (
                  <SelectItem
                    key={bt.value}
                    value={bt.value}
                    disabled={bt.value === "binary"}
                  >
                    {bt.label}
                    {bt.value === "binary" && " (Phase 2)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canFormatJson ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  title="Format JSON (Shift+Alt+F)"
                  onClick={() => formatJsonBody()}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Beautify
                  <kbd className="ml-1 hidden rounded border px-1 font-mono text-[10px] text-muted-foreground sm:inline">
                    ⇧⌥F
                  </kbd>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  title="Minify JSON"
                  onClick={() => minifyJsonBody()}
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Minify
                </Button>
              </div>
            ) : null}
          </div>
          {draft.bodyType === "form-data" && (
            <div className="min-h-[200px] flex-1 overflow-auto rounded-md border border-border/60 p-2">
              <FormDataEditor
                items={draft.formDataFields ?? []}
                onChange={(formDataFields) => markUnsaved({ formDataFields })}
                collectionId={draft.collectionId}
              />
            </div>
          )}
          {draft.bodyType === "graphql" && (
            <GraphQLBodyEditor
              tabId={tabId}
              draft={draft}
              editorTheme={editorTheme}
              onChange={markUnsaved}
            />
          )}
          {draft.bodyType !== "none" &&
            draft.bodyType !== "form-data" &&
            draft.bodyType !== "graphql" && (
            <div className="min-h-[200px] flex-1 overflow-hidden rounded-md border">
              <Editor
                height="100%"
                language={bodyLanguage}
                theme={editorTheme}
                value={draft.body}
                onChange={(v) => markUnsaved({ body: v ?? "" })}
                onMount={bodyOnMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: {
                    other: true,
                    comments: true,
                    strings: true,
                  },
                  formatOnPaste: canFormatJson,
                }}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="auth" className="mt-0 flex-1 overflow-auto pt-3">
          <AuthPanel
            auth={draft.auth}
            onChange={(auth) => markUnsaved({ auth })}
            collectionId={draft.collectionId}
          />
        </TabsContent>

        <TabsContent value="scripts" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden pt-3">
          <ScriptsPanel
            scripts={draft.scripts ?? { preRequest: "", postResponse: "", tests: "" }}
            onChange={(scripts) => markUnsaved({ scripts })}
            editorTheme={editorTheme}
            onSave={handleSave}
            collectionId={draft.collectionId}
          />
        </TabsContent>

        <TabsContent value="docs" className="mt-0 flex-1 overflow-auto pt-3">
          <MethodDocsPanel method={draft.method} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
