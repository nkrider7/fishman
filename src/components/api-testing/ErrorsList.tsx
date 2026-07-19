import { useState } from "react";
import type { ApiTestErrorSample } from "@/api-testing";
import { cn } from "@/utils/cn";

interface ErrorsListProps {
  errors: ApiTestErrorSample[];
  /** Total errors seen (may exceed errors.length when capped). */
  totalCount?: number;
}

export function ErrorsList({ errors, totalCount }: ErrorsListProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const total = totalCount ?? errors.length;

  if (errors.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No errors recorded.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {total > errors.length ? (
        <p className="text-[11px] text-muted-foreground">
          Showing {errors.length} of {total} errors
        </p>
      ) : null}
      <div className="max-h-48 space-y-1.5 overflow-auto">
        {errors.map((err, i) => {
          const open = expanded === i;
          return (
            <button
              key={`${err.atMs}-${i}`}
              type="button"
              className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/40"
              title={err.message}
              onClick={() => setExpanded(open ? null : i)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-destructive">
                  {err.status > 0 ? `HTTP ${err.status}` : "Network error"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {(err.atMs / 1000).toFixed(1)}s · {err.latencyMs}ms · VU{" "}
                  {err.vuId}
                </span>
              </div>
              <p
                className={cn(
                  "mt-0.5 text-muted-foreground",
                  !open && "truncate",
                )}
              >
                {err.message}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
