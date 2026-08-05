import { useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WsMessageType } from "@/types/websocket";
import { tryPrettyJson, validateJson } from "@/utils/websocket";
import { cn } from "@/utils/cn";

interface WsMessageComposerProps {
  connected: boolean;
  sending: boolean;
  messageType: WsMessageType;
  templates: Array<{
    id: string;
    name: string;
    type: WsMessageType;
    body: string;
  }>;
  onMessageTypeChange: (type: WsMessageType) => void;
  onSend: (type: WsMessageType, data: string) => void;
}

export function WsMessageComposer({
  connected,
  sending,
  messageType,
  templates,
  onMessageTypeChange,
  onSend,
}: WsMessageComposerProps) {
  const [body, setBody] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const placeholder =
    messageType === "json"
      ? '{ "hello": "world" }'
      : messageType === "binary"
        ? "Base64-encoded bytes…"
        : "Type a message…";

  const canSend = connected && !sending && body.trim().length > 0;

  const handleSend = () => {
    if (!connected) {
      setLocalError("Connect first");
      return;
    }
    if (!body.trim()) return;
    if (messageType === "json") {
      const err = validateJson(body);
      if (err) {
        setLocalError(err);
        return;
      }
    }
    setLocalError(null);
    onSend(messageType, body);
    textareaRef.current?.focus();
  };

  const formatJson = () => {
    if (messageType !== "json") return;
    const pretty = tryPrettyJson(body);
    setBody(pretty);
    setLocalError(validateJson(pretty));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/40 px-2">
        <Select
          value={messageType}
          onValueChange={(v) => {
            onMessageTypeChange(v as WsMessageType);
            setLocalError(null);
          }}
        >
          <SelectTrigger className="h-6 w-[92px] text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="binary">Binary</SelectItem>
          </SelectContent>
        </Select>

        {templates.length > 0 && (
          <Select
            onValueChange={(id) => {
              const t = templates.find((x) => x.id === id);
              if (!t) return;
              onMessageTypeChange(t.type);
              setBody(t.body);
              setLocalError(null);
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
          >
            <SelectTrigger className="h-6 w-[130px] text-[11px]">
              <SelectValue placeholder="Templates" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {messageType === "json" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={formatJson}
            title="Format JSON"
          >
            <Sparkles className="h-3 w-3" />
            Format
          </Button>
        )}

        <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
          Enter send · Shift+Enter newline
        </span>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 gap-2 p-2",
          !connected && "opacity-70",
        )}
      >
        <textarea
          ref={textareaRef}
          value={body}
          disabled={sending}
          placeholder={
            connected ? placeholder : "Connect above, then type a message…"
          }
          spellCheck={messageType === "text"}
          className={cn(
            "h-full min-h-0 w-full flex-1 resize-none rounded-md border border-input bg-muted/20 px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground outline-none",
            "placeholder:text-muted-foreground/55",
            "focus-visible:border-ring focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring",
          )}
          onChange={(e) => {
            setBody(e.target.value);
            if (localError) setLocalError(null);
          }}
          onKeyDown={onKeyDown}
        />

        <Button
          type="button"
          size="sm"
          className="h-9 w-[72px] shrink-0 self-end gap-1.5"
          disabled={!canSend}
          title={connected ? "Send message" : "Connect first"}
          onClick={handleSend}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Send
        </Button>
      </div>

      {localError && (
        <p className="shrink-0 border-t border-destructive/20 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {localError}
        </p>
      )}
    </div>
  );
}
