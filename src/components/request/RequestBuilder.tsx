import Editor from "@monaco-editor/react";
import { useMemo, useRef, useState } from "react";
import { useAppSelector } from "@/hooks/redux";
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
import { useAppDispatch } from "@/hooks/redux";
import { useMonacoVariableCompletions } from "@/hooks/useMonacoVariableCompletions";
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { sendRequestThunk } from "@/store/thunks/sendRequest";
import { saveActiveTab } from "@/store/thunks/saveActiveTab";
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
import { setApiTestingOpen } from "@/store/slices/uiSlice";
import {
  patchApiTestingConfig,
} from "@/store/slices/apiTestingSlice";
import { configFromActiveRequest } from "@/api-testing";
import { Code2, Gauge, Loader2, Minimize2, Save, Send, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";

interface RequestBuilderProps {
  tabId: string;
}

export function RequestBuilder({ tabId }: RequestBuilderProps) {
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.request.drafts[tabId]);
  const loading = useAppSelector((s) => s.response.loading[tabId]);
  const theme = useAppSelector((s) => s.settings.theme);
  const [codegenOpen, setCodegenOpen] = useState(false);
  const { enhanceOnMount } = useMonacoVariableCompletions(draft?.collectionId);
  const formatBodyRef = useRef<() => boolean>(() => false);

  const bodyLanguage =
    draft?.bodyType === "json" || draft?.bodyType === "graphql"
      ? "json"
      : draft?.bodyType === "xml" || draft?.bodyType === "html"
        ? "xml"
        : "plaintext";

  const bodyOnMount = useMemo(
    () =>
      enhanceOnMount(["json", "xml", "plaintext", "graphql"], (editor, monaco) => {
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
      <div className="flex items-center gap-2 border-b p-3">
        <Select
          value={draft.method}
          onValueChange={(v) => markUnsaved({ method: v as HttpMethod })}
        >
          <SelectTrigger
            className={cn("w-[100px] font-semibold", getMethodClass(draft.method))}
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
                        body: draft.body,
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
        <TabsList className="mt-1 h-10 w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0">
          {(
            [
              { value: "params", label: "Params" },
              { value: "headers", label: "Headers" },
              { value: "body", label: "Body" },
              { value: "auth", label: "Authorization" },
              {
                value: "scripts",
                label: "Scripts",
                badge:
                  draft.scripts?.preRequest ||
                  draft.scripts?.postResponse ||
                  draft.scripts?.tests
                    ? "*"
                    : null,
              },
              { value: "docs", label: "Docs" },
            ] as const
          ).map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "relative h-10 flex-none rounded-none border-b-2 border-transparent bg-transparent px-3.5 text-[13px] font-semibold cursor-pointer",
                "text-muted-foreground/80 shadow-none transition-colors",
                "hover:text-foreground",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
              )}
            >
              {tab.label}
              {"badge" in tab && tab.badge ? (
                <span className="ml-1 text-amber-500">{tab.badge}</span>
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
          {draft.bodyType !== "none" && draft.bodyType !== "form-data" && (
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
