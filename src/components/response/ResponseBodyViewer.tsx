import { useMemo } from "react";
import JsonView from "@uiw/react-json-view";
import Editor from "@monaco-editor/react";
import { HtmlResponsePreview } from "@/components/response/HtmlResponsePreview";
import { JsonBeautifier } from "@/components/response/JsonBeautifier";
import type { ResponseBodyViewState } from "@/hooks/useResponseBodyView";
import { getMonacoLanguage } from "@/utils/responseFormat";
import { tryFormatJson } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";

interface ResponseBodyViewerProps {
  body: string;
  editorTheme: "vs-dark" | "light";
  view: ResponseBodyViewState;
}

export function ResponseBodyViewer({
  body,
  editorTheme,
  view,
}: ResponseBodyViewerProps) {
  const {
    effectiveFormat,
    isJson,
    showPreview,
    jsonViewMode,
    bodyRevision,
    isJsonBody,
    setJsonViewMode,
  } = view;

  const displayBody = useMemo(() => {
    if (isJson && isJsonBody) {
      return tryFormatJson(body);
    }
    return body;
  }, [body, isJson, isJsonBody]);

  const parsedJson = useMemo(() => {
    if (!isJson || !isJsonBody) return null;
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  }, [body, isJson, isJsonBody]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {isJson && !showPreview && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 rounded-md border border-border/60 bg-muted/20 p-0.5">
            <button
              type="button"
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors",
                jsonViewMode === "code"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setJsonViewMode("code")}
            >
              Code
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors",
                jsonViewMode === "tree"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setJsonViewMode("tree")}
            >
              Tree
            </button>
          </div>
          <JsonBeautifier body={body} />
        </div>
      )}

      <div className="min-h-[200px] flex-1 overflow-hidden rounded-md border bg-background">
        {showPreview ? (
          <HtmlResponsePreview html={body} className="h-full min-h-[200px]" />
        ) : jsonViewMode === "tree" && parsedJson != null ? (
          <div className="h-full overflow-auto p-3">
            <JsonView
              value={parsedJson}
              collapsed={2}
              displayDataTypes={false}
            />
          </div>
        ) : (
          <Editor
            key={`${bodyRevision}-${effectiveFormat}`}
            height="100%"
            language={getMonacoLanguage(effectiveFormat)}
            theme={editorTheme}
            value={displayBody || "(empty body)"}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
