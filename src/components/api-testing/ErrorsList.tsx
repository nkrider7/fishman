import type { ApiTestErrorSample } from "@/api-testing";

interface ErrorsListProps {
  errors: ApiTestErrorSample[];
}

export function ErrorsList({ errors }: ErrorsListProps) {
  if (errors.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No errors recorded.
      </p>
    );
  }

  return (
    <div className="max-h-48 space-y-1.5 overflow-auto">
      {errors.map((err, i) => (
        <div
          key={`${err.atMs}-${i}`}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px]"
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
          <p className="mt-0.5 truncate text-muted-foreground">{err.message}</p>
        </div>
      ))}
    </div>
  );
}
