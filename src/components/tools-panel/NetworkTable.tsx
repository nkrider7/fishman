import { useAppDispatch } from "@/hooks/redux";
import {
  selectNetworkLogEntry,
  type NetworkLogEntry,
} from "@/store/slices/networkLogSlice";
import { getMethodClass } from "@/utils/requestBuilder";
import {
  formatDurationMs,
  formatNetworkTime,
  formatSizeBytes,
} from "@/utils/urlParts";
import { cn } from "@/utils/cn";

interface NetworkTableProps {
  entries: NetworkLogEntry[];
  selectedId: string | null;
}

function statusClass(code: number | null, error?: string): string {
  if (error || code == null || code === 0) return "text-destructive";
  if (code >= 200 && code < 300) return "text-emerald-600 dark:text-emerald-400";
  if (code >= 300 && code < 400) return "text-amber-600 dark:text-amber-400";
  if (code >= 400) return "text-destructive";
  return "text-muted-foreground";
}

export function NetworkTable({ entries, selectedId }: NetworkTableProps) {
  const dispatch = useAppDispatch();

  if (entries.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center px-4 text-xs text-muted-foreground">
        Send a request to see network activity.
      </div>
    );
  }

  return (
    <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
      <thead className="sticky top-0 z-10 bg-muted">
        <tr className="border-b border-border text-muted-foreground">
          <th className="px-2 py-1.5 font-medium">METHOD</th>
          <th className="px-2 py-1.5 font-medium">STATUS</th>
          <th className="px-2 py-1.5 font-medium">DOMAIN</th>
          <th className="px-2 py-1.5 font-medium">PATH</th>
          <th className="px-2 py-1.5 font-medium">TIME</th>
          <th className="px-2 py-1.5 font-medium">DURATION</th>
          <th className="px-2 py-1.5 font-medium">SIZE</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const selected = entry.id === selectedId;
          return (
            <tr
              key={entry.id}
              className={cn(
                "cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40",
                selected && "bg-accent/50",
              )}
              onClick={() => dispatch(selectNetworkLogEntry(entry.id))}
              title={entry.error ?? entry.url}
            >
              <td className="px-2 py-1.5">
                <span
                  className={cn(
                    "font-semibold uppercase",
                    getMethodClass(entry.method),
                  )}
                >
                  {entry.method}
                </span>
              </td>
              <td
                className={cn(
                  "px-2 py-1.5 font-mono tabular-nums",
                  statusClass(entry.statusCode, entry.error),
                )}
              >
                {entry.error
                  ? "ERR"
                  : entry.statusCode == null
                    ? "—"
                    : entry.statusCode}
              </td>
              <td className="max-w-[160px] truncate px-2 py-1.5 text-foreground">
                {entry.domain || "—"}
              </td>
              <td className="max-w-[280px] truncate px-2 py-1.5 text-muted-foreground">
                {entry.path || "/"}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-muted-foreground">
                {formatNetworkTime(entry.startedAt)}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums">
                {formatDurationMs(entry.durationMs)}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-muted-foreground">
                {formatSizeBytes(entry.sizeBytes)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
