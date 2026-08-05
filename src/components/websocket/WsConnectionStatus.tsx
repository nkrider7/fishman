import { useEffect, useState } from "react";
import type { WsTabState } from "@/store/slices/websocketSlice";
import type { WsConnectionStatus } from "@/types/websocket";
import { cn } from "@/utils/cn";

const STATUS_LABEL: Record<WsConnectionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  open: "Connected",
  closing: "Closing…",
  closed: "Disconnected",
  error: "Error",
};

function statusDotClass(status: WsConnectionStatus): string {
  switch (status) {
    case "open":
      return "bg-emerald-500";
    case "connecting":
    case "closing":
      return "bg-amber-500 animate-pulse";
    case "error":
      return "bg-red-500";
    default:
      return "bg-muted-foreground/45";
  }
}

function formatDuration(connectedAt: number | null, now: number): string {
  if (!connectedAt) return "—";
  const ms = Math.max(0, now - connectedAt);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return `${min}m ${rem}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

interface WsConnectionStatusBarProps {
  tab: WsTabState;
}

export function WsConnectionStatusBar({ tab }: WsConnectionStatusBarProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (tab.status !== "open" || !tab.connectedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [tab.status, tab.connectedAt]);

  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-border/50 bg-muted/15 px-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground/85">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", statusDotClass(tab.status))}
          aria-hidden
        />
        <span aria-live="polite">{STATUS_LABEL[tab.status]}</span>
      </span>

      <span className="tabular-nums" title="Messages sent">
        ↑ {tab.sentCount}
      </span>
      <span className="tabular-nums" title="Messages received">
        ↓ {tab.receivedCount}
      </span>
      <span className="tabular-nums" title="Connected duration">
        {formatDuration(tab.connectedAt, now)}
      </span>

      {tab.closeCode != null &&
        (tab.status === "closed" || tab.status === "idle") && (
          <span
            className="min-w-0 truncate text-muted-foreground/80"
            title={tab.closeReason ?? undefined}
          >
            code {tab.closeCode}
            {tab.closeReason ? `: ${tab.closeReason}` : ""}
          </span>
        )}

      {tab.error && (
        <span
          className="min-w-0 flex-1 truncate text-destructive"
          title={tab.error}
        >
          {tab.error}
        </span>
      )}
    </div>
  );
}
