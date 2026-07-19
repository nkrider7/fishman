import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { clearAllHistory } from "@/store/slices/historySlice";
import {
  HISTORY_GROUP_LABELS,
  type HistoryEntry,
  type HistoryGroup,
} from "@/types/history";
import { getHistoryGroup, formatDate, formatDuration } from "@/utils/dateGroups";
import { getMethodClass } from "@/utils/requestBuilder";
import { HTTP_METHODS } from "@/types/request";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RequestDraft } from "@/types/request";
import type { ApiResponse } from "@/types/response";
import { setResponse } from "@/store/slices/responseSlice";

export function HistoryList() {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.history.entries);
  const [methodFilter, setMethodFilter] = useState<string>("ALL");

  const filtered = useMemo(() => {
    if (methodFilter === "ALL") return entries;
    return entries.filter(
      (e) => e.method.toUpperCase() === methodFilter.toUpperCase(),
    );
  }, [entries, methodFilter]);

  const grouped = useMemo(() => {
    const groups: Record<HistoryGroup, HistoryEntry[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };
    for (const entry of filtered) {
      groups[getHistoryGroup(entry.created_at)].push(entry);
    }
    return groups;
  }, [filtered]);

  const handleOpen = (entry: HistoryEntry) => {
    const request = JSON.parse(entry.request_snapshot_json) as RequestDraft;
    const response = JSON.parse(entry.response_snapshot_json) as ApiResponse;
    dispatch(openRequestTab({ request })).then((result) => {
      if (openRequestTab.fulfilled.match(result)) {
        dispatch(setResponse({ tabId: result.payload, response }));
      }
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-2">
        <span className="text-sm font-medium">History</span>
        <div className="flex items-center gap-1">
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger
              className="h-7 w-[7.5rem] border-border/60 bg-background px-2 text-[11px] text-foreground shadow-none focus:ring-1 focus:ring-ring"
              title="Filter by HTTP method"
              aria-label="Filter history by method"
            >
              <SelectValue placeholder="All methods" />
            </SelectTrigger>
            <SelectContent
              align="end"
              className="min-w-[7.5rem] border-border bg-popover text-popover-foreground"
            >
              <SelectItem
                value="ALL"
                className="py-2 text-[11px] text-popover-foreground"
              >
                All methods
              </SelectItem>
              {HTTP_METHODS.map((m) => (
                <SelectItem
                  key={m}
                  value={m}
                  className="py-2 text-[11px] text-popover-foreground"
                >
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch(clearAllHistory())}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-24 pt-1 pr-1 pl-1">
        {(Object.keys(grouped) as HistoryGroup[]).map((group) => {
          const items = grouped[group];
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-4">
              <h3 className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">
                {HISTORY_GROUP_LABELS[group]}
              </h3>
              <div className="space-y-1">
                {items.map((entry) => (
                  <button
                    key={entry.id}
                    className="flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => handleOpen(entry)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "font-semibold",
                          getMethodClass(entry.method),
                        )}
                      >
                        {entry.method}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {entry.url}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant={
                          entry.status_code >= 200 && entry.status_code < 300
                            ? "success"
                            : entry.status_code >= 400
                              ? "error"
                              : "secondary"
                        }
                      >
                        {entry.status_code}
                      </Badge>
                      <span>{formatDuration(entry.duration_ms)}</span>
                      <span>{formatDate(entry.created_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {entries.length === 0
              ? "No history yet. Send a request to get started."
              : `No ${methodFilter} requests in history.`}
          </p>
        )}
      </div>
    </div>
  );
}
