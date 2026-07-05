import Editor from "@monaco-editor/react";
import { useAppSelector } from "@/hooks/redux";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { FormDataEditor } from "@/components/request/FormDataEditor";
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
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { sendRequestThunk } from "@/store";
import { saveActiveTab } from "@/store/thunks/saveActiveTab";
import {
  BODY_TYPES,
  HTTP_METHODS,
  createFormDataField,
  type BodyType,
  type HttpMethod,
} from "@/types/request";
import { getMethodClass } from "@/utils/requestBuilder";
import { Loader2, Save, Send } from "lucide-react";
import { cn } from "@/utils/cn";

interface RequestBuilderProps {
  tabId: string;
}

export function RequestBuilder({ tabId }: RequestBuilderProps) {
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.request.drafts[tabId]);
  const loading = useAppSelector((s) => s.response.loading[tabId]);
  const theme = useAppSelector((s) => s.settings.theme);

  if (!draft) return null;

  const markUnsaved = (changes: Parameters<typeof updateDraft>[0]["changes"]) => {
    dispatch(updateDraft({ tabId, changes }));
    dispatch(updateTab({ id: tabId, changes: { unsaved: true } }));
    if (changes.name) {
      dispatch(updateTab({ id: tabId, changes: { title: changes.name } }));
    }
  };

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
          <SelectTrigger className={cn("w-[120px] font-semibold", getMethodClass(draft.method))}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HTTP_METHODS.map((m) => (
              <SelectItem key={m} value={m} className={getMethodClass(m)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <VariableAwareInput
          className="min-w-0 flex-1"
          value={draft.url}
          collectionId={draft.collectionId}
          placeholder="https://api.example.com/endpoint or {{base_url}}/path"
          onChange={(url) => markUnsaved({ url })}
        />
        <Button variant="outline" onClick={handleSave} title="Save (Ctrl+S)">
          <Save className="h-4 w-4" />
          Save
        </Button>
        <Button onClick={handleSend} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send
        </Button>
      </div>

      <Tabs defaultValue="params" className="flex flex-1 flex-col overflow-hidden px-3 pb-3">
        <TabsList className="mt-2 w-full justify-start">
          <TabsTrigger value="params">Params</TabsTrigger>
          <TabsTrigger value="headers">Headers</TabsTrigger>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="auth">Authorization</TabsTrigger>
          <TabsTrigger value="scripts" disabled>
            Scripts
          </TabsTrigger>
          <TabsTrigger value="tests" disabled>
            Tests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="params" className="flex-1 overflow-auto pt-2">
          <KeyValueEditor
            items={draft.params}
            onChange={(params) => markUnsaved({ params })}
            keyPlaceholder="Parameter"
            collectionId={draft.collectionId}
          />
        </TabsContent>

        <TabsContent value="headers" className="flex-1 overflow-auto pt-2">
          <KeyValueEditor
            items={draft.headers}
            onChange={(headers) => markUnsaved({ headers })}
            keyPlaceholder="Header"
            collectionId={draft.collectionId}
          />
        </TabsContent>

        <TabsContent value="body" className="flex flex-1 flex-col gap-3 overflow-hidden">
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
                language={
                  draft.bodyType === "json" || draft.bodyType === "graphql"
                    ? "json"
                    : draft.bodyType === "xml" || draft.bodyType === "html"
                      ? "xml"
                      : "plaintext"
                }
                theme={editorTheme}
                value={draft.body}
                onChange={(v) => markUnsaved({ body: v ?? "" })}
                onMount={(editor, monaco) => {
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                    () => handleSave(),
                  );
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="auth" className="flex-1 overflow-auto pt-2">
          <AuthPanel
            auth={draft.auth}
            onChange={(auth) => markUnsaved({ auth })}
            collectionId={draft.collectionId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
