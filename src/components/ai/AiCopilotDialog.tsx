import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAiCopilot } from "@/hooks/useAiCopilot";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMethodClass } from "@/utils/requestBuilder";
import {
  Sparkles,
  Loader2,
  CornerDownLeft,
  ExternalLink,
  Copy,
  Check,
  Cpu,
  ShieldCheck,
  Search,
  Code2,
  Terminal,
  Database,
} from "lucide-react";

export function AiCopilotDialog() {
  const {
    isOpen,
    loading,
    status,
    prompt,
    lastResult,
    error,
    closeCopilot,
    setPrompt,
    submitPrompt,
    applyToCurrentTab,
    applyToNewTab,
    applySetVariable,
    applySearch,
  } = useAiCopilot();

  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      setCopied(false);
    }
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.metaKey || e.ctrlKey) {
        if (lastResult?.generatedRequest) {
          applyToNewTab(lastResult.generatedRequest);
          return;
        }
      }
      if (!loading) {
        if (lastResult?.generatedRequest && prompt.trim() === "") {
          applyToCurrentTab(lastResult.generatedRequest);
        } else {
          void submitPrompt(prompt);
        }
      }
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const quickPrompts = [
    {
      label: "User Registration",
      icon: Terminal,
      query: "Create a POST request for user registration with email and password",
    },
    {
      label: "User Login",
      icon: Terminal,
      query: "Create a POST request for user login with username and password",
    },
    {
      label: "Parse cURL",
      icon: Code2,
      query: "curl -X POST https://api.example.com/v1/orders -H 'Content-Type: application/json' -d '{\"item\":\"Fishman Pro\",\"qty\":1}'",
    },
    {
      label: "Generate TS Schema",
      icon: Database,
      query: "Extract typescript interface from response: {\"id\": 101, \"title\": \"Product\", \"price\": 49.99, \"inStock\": true}",
    },
    {
      label: "Search Endpoints",
      icon: Search,
      query: "Search workspace for auth and user endpoints",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeCopilot()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-xl shadow-2xl border-primary/20">
        <DialogHeader className="sr-only">
          <DialogTitle>Ask Fishman AI Copilot</DialogTitle>
        </DialogHeader>

        {/* Input Bar */}
        <div className="relative flex items-center border-b border-border bg-muted/20 px-4 py-3">
          <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/70"
            placeholder="Ask Fishman: 'Create POST user registration', paste cURL, or 'Extract TS schema'..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center gap-1.5 pl-2">
            {prompt.trim() && (
              <Button
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs font-semibold"
                disabled={loading}
                onClick={() => void submitPrompt(prompt)}
              >
                {loading ? "Running..." : "Run"}
                <CornerDownLeft className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Quick Suggestion Pills */}
        {!lastResult && !loading && (
          <div className="flex flex-wrap gap-1.5 border-b border-border/50 bg-background/50 px-4 py-2.5">
            <span className="text-[11px] font-medium text-muted-foreground self-center mr-1">
              Suggestions:
            </span>
            {quickPrompts.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.label}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted hover:border-border transition-colors"
                  onClick={() => {
                    setPrompt(p.query);
                    void submitPrompt(p.query);
                  }}
                >
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Body / Results Area */}
        <div className="max-h-[460px] overflow-y-auto p-4 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              <span className="font-semibold">Error:</span> {error}
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs font-medium text-muted-foreground">
                Needle 2 reasoning & tool routing...
              </p>
            </div>
          )}

          {/* Result: Generated HTTP Request */}
          {lastResult?.generatedRequest && !loading && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded ${getMethodClass(
                        lastResult.generatedRequest.method,
                      )}`}
                    >
                      {lastResult.generatedRequest.method}
                    </span>
                    <span className="text-xs font-semibold text-foreground truncate">
                      {lastResult.generatedRequest.name}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">
                    {lastResult.generatedRequest.url}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(lastResult.generatedRequest, null, 2),
                      )
                    }
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    JSON
                  </Button>
                </div>
              </div>

              {lastResult.generatedRequest.description && (
                <p className="text-[11px] text-muted-foreground">
                  {lastResult.generatedRequest.description}
                </p>
              )}

              {/* Request Headers & Params summary */}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {lastResult.generatedRequest.headers.length > 0 && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {lastResult.generatedRequest.headers.length} header
                    {lastResult.generatedRequest.headers.length > 1 ? "s" : ""}
                  </Badge>
                )}
                {lastResult.generatedRequest.params.length > 0 && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {lastResult.generatedRequest.params.length} query param
                    {lastResult.generatedRequest.params.length > 1 ? "s" : ""}
                  </Badge>
                )}
                {lastResult.generatedRequest.bodyType !== "none" && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    body: {lastResult.generatedRequest.bodyType}
                  </Badge>
                )}
              </div>

              {/* Body snippet */}
              {lastResult.generatedRequest.body && (
                <div className="relative rounded-md border border-border/70 bg-muted/40 p-2.5 font-mono text-[11px] max-h-36 overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-all">
                    {lastResult.generatedRequest.body}
                  </pre>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => applyToNewTab(lastResult.generatedRequest!)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in New Tab
                  <kbd className="hidden sm:inline ml-1 font-mono text-[9px] text-muted-foreground border px-1 rounded">
                    ⌘↵
                  </kbd>
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-semibold"
                  onClick={() => applyToCurrentTab(lastResult.generatedRequest!)}
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  Apply to Current Tab
                  <kbd className="hidden sm:inline ml-1 font-mono text-[9px] border border-primary-foreground/30 px-1 rounded">
                    ↵
                  </kbd>
                </Button>
              </div>
            </div>
          )}

          {/* Result: Generated Schema */}
          {lastResult?.generatedSchema && !loading && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Code2 className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">
                    Extracted TypeScript / Schema
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => copyToClipboard(lastResult.generatedSchema!)}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  Copy Code
                </Button>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/40 p-2.5 font-mono text-[11px] max-h-52 overflow-y-auto">
                <pre className="whitespace-pre-wrap">
                  {lastResult.generatedSchema}
                </pre>
              </div>
            </div>
          )}

          {/* Result: Set Environment Variable */}
          {lastResult?.setVariable && !loading && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">
                    Environment Variable
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded bg-muted/40 p-2 text-xs font-mono">
                <span className="text-primary font-bold">
                  {`{{${lastResult.setVariable.key}}}`}
                </span>
                <span>=</span>
                <span className="text-foreground truncate">
                  {lastResult.setVariable.value}
                </span>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    void applySetVariable(
                      lastResult.setVariable!.key,
                      lastResult.setVariable!.value,
                    )
                  }
                >
                  Save to Environment
                </Button>
              </div>
            </div>
          )}

          {/* Result: Search Query */}
          {lastResult?.searchQuery && !loading && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3.5 shadow-sm">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <span className="text-xs">
                  Filter workspace for:{" "}
                  <strong className="font-mono text-primary">
                    {lastResult.searchQuery}
                  </strong>
                </span>
              </div>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => applySearch(lastResult.searchQuery!)}
              >
                Filter Tree
              </Button>
            </div>
          )}
        </div>

        {/* Footer / Status Bar */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 font-medium">
              <Cpu className="h-3 w-3 text-primary" />
              {status?.engineType || "Needle 2 (45M CQ2)"}
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-green-500" />
              100% Offline & Private
            </span>
            {status?.ramUsageMb ? (
              <span>~{status.ramUsageMb} MB RAM</span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {lastResult && (
              <span className="font-mono text-[10px]">
                ⚡ {lastResult.latencyMs}ms
              </span>
            )}
            <kbd className="hidden sm:inline border px-1 py-0.5 rounded text-[10px]">
              Esc to close
            </kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
