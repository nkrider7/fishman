import { useEffect, useMemo, useState, type ReactNode } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { Copy, Download, Minimize2, Sparkles } from "lucide-react";
import { HtmlResponsePreview } from "@/components/response/HtmlResponsePreview";
import { JsonTreeViewer } from "@/components/response/JsonTreeViewer";
import type { ResponseBodyViewState } from "@/hooks/useResponseBodyView";
import { getMonacoLanguage } from "@/utils/responseFormat";
import { minifyJson, tryFormatJson } from "@/utils/requestBuilder";
import { registerMonacoEditor } from "@/monaco/editor-registry";
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

  const [overrideBody, setOverrideBody] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOverrideBody(null);
  }, [body, bodyRevision]);

  const formattedJson = useMemo(() => {
    if (isJson && isJsonBody) return tryFormatJson(body);
    return body;
  }, [body, isJson, isJsonBody]);

  const displayBody = overrideBody ?? formattedJson;

  const parsedJson = useMemo(() => {
    if (!isJson || !isJsonBody) return null;
    try {
      return JSON.parse(overrideBody ?? body) as unknown;
    } catch {
      return null;
    }
  }, [body, isJson, isJsonBody, overrideBody]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayBody);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const handleDownload = () => {
    const blob = new Blob([displayBody], {
      type: isJson ? "application/json;charset=utf-8" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = isJson ? "response.json" : "response.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const onMount: OnMount = (editor) => {
    registerMonacoEditor(editor);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {(isJson && !showPreview) || (!showPreview && body) ? (
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/40 px-2.5">
          {isJson && !showPreview && (
            <div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5">
              <ModeChip
                active={jsonViewMode === "code"}
                onClick={() => setJsonViewMode("code")}
              >
                Code
              </ModeChip>
              <ModeChip
                active={jsonViewMode === "tree"}
                onClick={() => setJsonViewMode("tree")}
              >
                Tree
              </ModeChip>
            </div>
          )}

          <div className="ml-auto flex items-center gap-0.5">
            {isJson && isJsonBody && (
              <>
                <ToolIcon
                  title="Pretty print"
                  onClick={() => setOverrideBody(tryFormatJson(body))}
                >
                  <Sparkles className="h-3 w-3" />
                </ToolIcon>
                <ToolIcon
                  title="Minify"
                  onClick={() => setOverrideBody(minifyJson(body))}
                >
                  <Minimize2 className="h-3 w-3" />
                </ToolIcon>
              </>
            )}
            <ToolIcon title={copied ? "Copied" : "Copy"} onClick={() => void handleCopy()}>
              <Copy className="h-3 w-3" />
            </ToolIcon>
            <ToolIcon title="Download" onClick={handleDownload}>
              <Download className="h-3 w-3" />
            </ToolIcon>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {showPreview ? (
          <HtmlResponsePreview html={body} className="h-full min-h-0" />
        ) : jsonViewMode === "tree" &&
          parsedJson != null &&
          typeof parsedJson === "object" ? (
          <JsonTreeViewer value={parsedJson as object} />
        ) : (
          <Editor
            key={`${bodyRevision}-${effectiveFormat}-${overrideBody ? "o" : "b"}`}
            height="100%"
            language={getMonacoLanguage(effectiveFormat)}
            theme={editorTheme}
            value={displayBody || "(empty body)"}
            onMount={onMount}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: "on",
              lineNumbersMinChars: 3,
              glyphMargin: false,
              folding: true,
              renderLineHighlight: "none",
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
              padding: { top: 10, bottom: 10 },
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

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 text-[11px] transition-colors",
        active
          ? "bg-background font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ToolIcon({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
