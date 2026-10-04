import type { NetworkLogEntry, NetworkLogLevel } from "@/store/slices/networkLogSlice";
import { cn } from "@/utils/cn";

interface NetworkTracePaneProps {
  entry: NetworkLogEntry;
}

function formatTraceTimestamp(epochMs: number): string {
  const date = new Date(epochMs);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function levelClass(level: NetworkLogLevel): string {
  switch (level) {
    case "request":
      return "text-sky-600 dark:text-sky-400";
    case "success":
      return "text-emerald-600 dark:text-emerald-400";
    case "warn":
      return "text-amber-600 dark:text-amber-400";
    case "error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

export function NetworkTracePane({ entry }: NetworkTracePaneProps) {
  const lines = entry.trace ?? [];

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-[11px] text-muted-foreground">
        No network trace captured for this request.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Network Logs
      </h4>
      <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {lines.map((line, index) => (
          <div key={`${line.at}-${index}`} className="py-0.5">
            <span className="text-muted-foreground/80">
              {formatTraceTimestamp(line.at)}{" "}
            </span>
            <span className={cn(levelClass(line.level))}>{line.message}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
