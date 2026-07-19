import Editor from "@monaco-editor/react";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface CodeSnippetViewerProps {
  code: string;
  language: string;
  theme: "vs-dark" | "light";
}

export function CodeSnippetViewer({
  code,
  language,
  theme,
}: CodeSnippetViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(360);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const nextHeight = container.getBoundingClientRect().height;
      if (nextHeight > 0) {
        setEditorHeight(Math.floor(nextHeight));
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopyError("Copy failed");
      setCopied(false);
    }
  };

  return (
    <div className="relative flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-md border border-border bg-muted/20">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        {copyError && (
          <span className="text-xs text-destructive" role="status">
            {copyError}
          </span>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5 shadow-sm"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>
      <div ref={containerRef} className="min-h-[320px] w-full flex-1">
        <Editor
          height={editorHeight}
          language={language}
          theme={theme}
          value={code}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "none",
            contextmenu: true,
            folding: true,
            domReadOnly: true,
          }}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Code copied to clipboard" : ""}
      </span>
    </div>
  );
}
