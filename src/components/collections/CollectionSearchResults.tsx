import { useDeferredValue, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  buildRequestSearchIndex,
  filterSearchIndex,
} from "@/collections/search-index";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";
import { VirtualList } from "./VirtualizedTreeList";

/**
 * Flat, indexed, virtualized search results — used when the query is non-empty
 * or the workspace is large (avoids expanding the full recursive tree).
 */
export function CollectionSearchResults({ query }: { query: string }) {
  const dispatch = useAppDispatch();
  const folders = useAppSelector((s) => s.collections.folders);
  const requests = useAppSelector((s) => s.collections.requests);
  const deferredQuery = useDeferredValue(query);

  const index = useMemo(
    () => buildRequestSearchIndex(requests, folders),
    [requests, folders],
  );

  const results = useMemo(
    () => filterSearchIndex(index, deferredQuery),
    [index, deferredQuery],
  );

  const byId = useMemo(
    () => new Map(requests.map((r) => [r.id, r])),
    [requests],
  );

  return (
    <VirtualList
      className="min-h-0 flex-1"
      items={results}
      estimateSize={32}
      getKey={(e) => e.id}
      empty={
        <p className="px-3 py-4 text-sm text-muted-foreground">
          {query.trim() ? "No requests match." : "No requests in this project."}
        </p>
      }
      renderItem={(entry) => {
        const row = byId.get(entry.id);
        if (!row) return null;
        return (
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2 px-3 text-left text-xs hover:bg-muted/50"
            onClick={() => void dispatch(openRequestTab(row))}
            title={`${entry.method} ${entry.url}`}
          >
            <span
              className={cn(
                "w-12 shrink-0 font-mono text-[10px] font-semibold",
                getMethodClass(entry.method),
              )}
            >
              {entry.method}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {entry.folderPath ? (
              <span className="max-w-[40%] truncate text-[10px] text-muted-foreground">
                {entry.folderPath}
              </span>
            ) : null}
          </button>
        );
      }}
    />
  );
}
