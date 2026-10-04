import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAiCopilot } from "@/hooks/useAiCopilot";
import { useAppDispatch } from "@/hooks/redux";
import { openAiScanner } from "@/store/slices/aiScannerSlice";
import { Button } from "@/components/ui/button";
import { getMethodClass } from "@/utils/requestBuilder";
import {
  Sparkles,
  Loader2,
  Send,
  ExternalLink,
  Copy,
  Check,
  Cpu,
  ShieldCheck,
  Trash2,
  X,
  CornerDownLeft,
  Bot,
  User,
  ScanSearch,
} from "lucide-react";

export function AiSidebar() {
  const {
    messages,
    loading,
    status,
    prompt,
    closeSidebar,
    setPrompt,
    submitPrompt,
    applyToCurrentTab,
    applyToNewTab,
    applySetVariable,
    applySearch,
    clearChatMessages,
  } = useAiCopilot();
  const dispatch = useAppDispatch();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && prompt.trim()) {
        void submitPrompt(prompt);
      }
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const quickPrompts = [
    {
      label: "User Auth POST",
      query: "Create a POST request for user login with email and password",
    },
    {
      label: "Parse cURL",
      query: "curl -X POST https://api.example.com/v1/checkout -H 'Content-Type: application/json' -d '{\"plan\":\"pro\"}'",
    },
    {
      label: "Extract Schema",
      query: "Extract typescript interface from response: {\"id\": 1, \"name\": \"Fishman\", \"version\": \"0.1.2\"}",
    },
    {
      label: "Save Variable",
      query: "Save response token as variable {{AUTH_TOKEN}}",
    },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-background/95 border-l border-border select-none">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/80 px-3 bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-foreground">
              Fishman Copilot
            </span>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground leading-none mt-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>{status?.engineType || "Needle 2"} (Offline)</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Scan Backend Codebase with AI"
            onClick={() => dispatch(openAiScanner())}
          >
            <ScanSearch className="h-3.5 w-3.5" />
          </Button>
          {messages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Clear conversation"
              onClick={() => clearChatMessages()}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Close AI Sidebar"
            onClick={closeSidebar}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-4 text-xs"
      >
        {messages.length === 0 ? (
          /* Empty / Welcome State */
          <div className="flex h-full flex-col items-center justify-center py-8 text-center space-y-4 px-2">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-transparent border border-primary/30 shadow-md">
              <Sparkles className="h-7 w-7 text-primary" />
              <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20 text-[9px] font-bold text-green-500 border border-green-500/40">
                ✓
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                Ask Fishman Copilot
              </h3>
              <p className="text-[11px] text-muted-foreground max-w-[260px] leading-relaxed">
                Powered by Needle 2 (45M parameters). Runs 100% on your machine with ~28 MB RAM and zero cloud latency.
              </p>
            </div>

            <div className="w-full space-y-2 pt-1 text-left">
              <button
                type="button"
                onClick={() => dispatch(openAiScanner())}
                className="w-full flex items-center gap-2.5 rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 via-purple-500/10 to-transparent p-2.5 text-left hover:border-primary/60 hover:from-primary/15 transition-all group"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/20 text-primary group-hover:scale-105 transition-transform">
                  <ScanSearch className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Scan Backend Codebase
                    <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[9px] font-medium text-primary border border-primary/30">
                      Needle AI
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    FastAPI, Express, NestJS, Spring, Gin
                  </div>
                </div>
              </button>

              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 block pt-1">
                Suggested Actions
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {quickPrompts.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 p-2 text-left hover:bg-muted/70 hover:border-primary/40 transition-all group"
                    onClick={() => {
                      setPrompt(q.query);
                      void submitPrompt(q.query);
                    }}
                  >
                    <span className="font-medium text-foreground text-[11px]">
                      {q.label}
                    </span>
                    <CornerDownLeft className="h-3 w-3 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Message List */
          messages.map((msg) => {
            const isUser = msg.sender === "user";
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${
                  isUser ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {isUser ? (
                    <User className="h-3.5 w-3.5" />
                  ) : (
                    <Bot className="h-3.5 w-3.5" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`flex flex-col gap-1 max-w-[85%] ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                  {/* User text bubble */}
                  {isUser && (
                    <div className="rounded-2xl rounded-tr-xs bg-primary px-3 py-2 text-primary-foreground shadow-xs text-xs font-medium whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  )}

                  {/* AI response card */}
                  {!isUser && (
                    <div className="w-full space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-xs">
                      {/* Header bar */}
                      <div className="flex items-center justify-between gap-1 text-[10px]">
                        <span className="font-semibold text-primary">
                          {msg.result?.toolCall.name || "AI Agent"}
                        </span>
                        {msg.result?.latencyMs !== undefined && (
                          <span className="font-mono text-muted-foreground">
                            ⚡ {msg.result.latencyMs}ms
                          </span>
                        )}
                      </div>

                      {/* Error state */}
                      {msg.error && (
                        <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-500">
                          {msg.error}
                        </div>
                      )}

                      {/* Tool: generatedRequest */}
                      {msg.result?.generatedRequest && (
                        <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getMethodClass(
                                msg.result.generatedRequest.method,
                              )}`}
                            >
                              {msg.result.generatedRequest.method}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px] gap-1"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(
                                    msg.result?.generatedRequest,
                                    null,
                                    2,
                                  ),
                                  msg.id,
                                )
                              }
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              JSON
                            </Button>
                          </div>

                          <div className="font-mono text-[11px] text-foreground font-semibold break-all">
                            {msg.result.generatedRequest.url}
                          </div>

                          {/* Body preview */}
                          {msg.result.generatedRequest.body && (
                            <div className="rounded border border-border/60 bg-muted/50 p-2 font-mono text-[10px] max-h-32 overflow-y-auto">
                              <pre className="whitespace-pre-wrap break-all">
                                {msg.result.generatedRequest.body}
                              </pre>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <Button
                              size="sm"
                              className="h-7 text-[11px] font-semibold flex-1 gap-1"
                              onClick={() =>
                                applyToCurrentTab(
                                  msg.result!.generatedRequest!,
                                )
                              }
                            >
                              <CornerDownLeft className="h-3 w-3" />
                              Apply to Tab
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1"
                              onClick={() =>
                                applyToNewTab(msg.result!.generatedRequest!)
                              }
                            >
                              <ExternalLink className="h-3 w-3" />
                              New Tab
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Tool: generatedSchema */}
                      {msg.result?.generatedSchema && (
                        <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              TypeScript Definition
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px] gap-1"
                              onClick={() =>
                                copyToClipboard(
                                  msg.result!.generatedSchema!,
                                  msg.id,
                                )
                              }
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              Copy
                            </Button>
                          </div>
                          <div className="rounded border border-border/60 bg-muted/50 p-2 font-mono text-[10px] max-h-40 overflow-y-auto">
                            <pre className="whitespace-pre-wrap">
                              {msg.result.generatedSchema}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Tool: setVariable */}
                      {msg.result?.setVariable && (
                        <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-2.5">
                          <div className="font-mono text-[11px]">
                            <span className="text-primary font-bold">{`{{${msg.result.setVariable.key}}}`}</span>
                            {" = "}
                            <span className="text-foreground">
                              {msg.result.setVariable.value}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            className="h-6 text-[10px] w-full"
                            onClick={() =>
                              void applySetVariable(
                                msg.result!.setVariable!.key,
                                msg.result!.setVariable!.value,
                              )
                            }
                          >
                            Save to Active Environment
                          </Button>
                        </div>
                      )}

                      {/* Tool: searchQuery */}
                      {msg.result?.searchQuery && (
                        <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-2">
                          <span className="text-[11px] truncate">
                            Filter: <strong>{msg.result.searchQuery}</strong>
                          </span>
                          <Button
                            size="sm"
                            className="h-6 text-[10px]"
                            onClick={() =>
                              applySearch(msg.result!.searchQuery!)
                            }
                          >
                            Filter Tree
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Loading Bubble */}
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-xs">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-[11px] text-muted-foreground font-medium">
              Needle 2 reasoning & tool routing...
            </span>
          </div>
        )}
      </div>

      {/* Input Composer */}
      <div className="p-3 border-t border-border bg-muted/10 space-y-2">
        <div className="relative flex flex-col rounded-xl border border-border bg-background focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/40 transition-all shadow-xs overflow-hidden">
          <textarea
            ref={inputRef}
            rows={2}
            className="w-full resize-none bg-transparent p-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none"
            placeholder="Ask Copilot (e.g. 'Create auth POST', paste cURL)..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center justify-between px-2.5 pb-2 pt-0.5">
            <span className="text-[10px] text-muted-foreground">
              ↵ to send
            </span>
            <Button
              size="sm"
              className="h-6 w-6 rounded-lg p-0"
              disabled={loading || !prompt.trim()}
              onClick={() => {
                if (!loading && prompt.trim()) {
                  void submitPrompt(prompt);
                }
              }}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>

        {/* Status footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-green-500" />
            <span>100% Offline & Private</span>
          </div>
          <div className="flex items-center gap-1">
            <Cpu className="h-3 w-3 text-primary" />
            <span>28 MB RAM</span>
          </div>
        </div>
      </div>
    </div>
  );
}
