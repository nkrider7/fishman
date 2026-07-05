import { useMemo } from "react";
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
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RequestDraft } from "@/types/request";
import type { ApiResponse } from "@/types/response";
import { setResponse } from "@/store/slices/responseSlice";

export function HistoryList() {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.history.entries);

  const grouped = useMemo(() => {
    const groups: Record<HistoryGroup, HistoryEntry[]> = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };
    for (const entry of entries) {
      groups[getHistoryGroup(entry.created_at)].push(entry);
    }
    return groups;
  }, [entries]);

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
      <div className="flex items-center justify-between border-b p-2">
        <span className="text-sm font-medium">History</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch(clearAllHistory())}
        >
          Clear
        </Button>
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
        {entries.length === 0 && (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            No history yet. Send a request to get started.
          </p>
        )}
      </div>
    </div>
  );
}
