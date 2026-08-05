import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  Info,
} from "lucide-react";
import type { WsLogEntry } from "@/types/websocket";
import type { WsLogFilter } from "@/store/slices/websocketSlice";
import { formatWsSize, looksLikeJson, tryPrettyJson } from "@/utils/websocket";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    const base = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${base}.${ms}`;
  } catch {
    return String(ts);
  }
}

function typeBadge(entry: WsLogEntry): string {
  if (entry.direction === "system") return "SYS";
  if (entry.opcode === "binary") return "BIN";
  if (entry.encoding === "utf8" && looksLikeJson(entry.data)) return "JSON";
  if (entry.opcode === "ping" || entry.opcode === "pong") {
    return entry.opcode.toUpperCase();
  }
  return "TXT";
}

function previewText(entry: WsLogEntry, max = 160): string {
  if (entry.encoding === "base64") {
    return `[binary ${formatWsSize(entry.size)}] ${entry.data.slice(0, 48)}${
      entry.data.length > 48 ? "…" : ""
    }`;
  }
  const oneLine = entry.data.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine || "(empty)";
  return `${oneLine.slice(0, max)}…`;
}

function detailText(entry: WsLogEntry): string {
  if (entry.encoding === "utf8" && looksLikeJson(entry.data)) {
    return tryPrettyJson(entry.data);
  }
  return entry.data || "(empty)";
}

interface WsMessageListProps {
  messages: WsLogEntry[];
  filter: WsLogFilter;
  showSystemFrames: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function WsMessageList({
  messages,
  filter,
  showSystemFrames,
  selectedId,
  onSelect,
}: WsMessageListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [copied, setCopied] = useState(false);

  const visible = useMemo(
    () =>
      messages.filter((m) => {
        if (
          !showSystemFrames &&
          (m.direction === "system" ||
            m.opcode === "ping" ||
            m.opcode === "pong")
        ) {
          return false;
        }
        if (filter === "all") return true;
        return m.direction === filter;
      }),
    [messages, filter, showSystemFrames],
  );

  const selected = selectedId
    ? (visible.find((m) => m.id === selectedId) ?? null)
    : null;

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = dist < 56;
  };

  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const copySelected = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(detailText(selected));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        {visible.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">
            No messages in this filter
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {visible.map((entry) => {
              const isSelected = entry.id === selectedId;
              const isOut = entry.direction === "outgoing";
              const isSys = entry.direction === "system";

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full gap-2 px-3 py-2 text-left transition-colors",
                      "hover:bg-muted/40",
                      isSelected && "bg-muted/55",
                    )}
                    onClick={() => onSelect(isSelected ? null : entry.id)}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded",
                        isOut && "bg-violet-500/15 text-violet-500",
                        !isOut &&
                          !isSys &&
                          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                        isSys && "bg-muted text-muted-foreground",
                      )}
                      title={entry.direction}
                    >
                      {isSys ? (
                        <Info className="h-3 w-3" />
                      ) : isOut ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownLeft className="h-3 w-3" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                        <span
                          className={cn(
                            "rounded px-1 py-px font-semibold tracking-wide",
                            typeBadge(entry) === "JSON" &&
                              "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                            typeBadge(entry) === "BIN" &&
                              "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                            typeBadge(entry) === "SYS" &&
                              "bg-muted text-muted-foreground",
                            typeBadge(entry) === "TXT" &&
                              "bg-muted text-foreground/70",
                          )}
                        >
                          {typeBadge(entry)}
                        </span>
                        <span className="font-mono">{formatTime(entry.timestamp)}</span>
                        <span>{formatWsSize(entry.size)}</span>
                        <span className="capitalize opacity-70">
                          {entry.direction}
                        </span>
                      </span>
                      <span className="block truncate font-mono text-[11px] leading-relaxed text-foreground/90">
                        {previewText(entry)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex h-[38%] min-h-[120px] max-h-[280px] shrink-0 flex-col border-t border-border/60 bg-muted/15">
          <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3">
            <span className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Detail · {typeBadge(selected)} · {formatWsSize(selected.size)} ·{" "}
              {formatTime(selected.timestamp)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => void copySelected()}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Copy
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
            <pre className="whitespace-pre-wrap break-all p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
              {detailText(selected)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
