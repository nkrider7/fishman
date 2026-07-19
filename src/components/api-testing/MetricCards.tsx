import type { ApiTestMetrics } from "@/api-testing";
import { cn } from "@/utils/cn";

interface MetricCardsProps {
  metrics: ApiTestMetrics;
}

function Card({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums tracking-tight",
          valueClass ?? "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const errClass =
    metrics.errorRatePct >= 5
      ? "text-destructive"
      : metrics.errorRatePct > 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  const avgClass =
    metrics.avgMs >= 1000
      ? "text-destructive"
      : metrics.avgMs >= 500
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Card
        label="Avg response time"
        value={`${metrics.avgMs}ms`}
        sub={`p50: ${metrics.p50Ms}ms / p95: ${metrics.p95Ms}ms / p99: ${metrics.p99Ms}ms`}
        valueClass={avgClass}
      />
      <Card
        label="Throughput"
        value={`${metrics.throughputRps} req/s`}
        sub={`${metrics.totalRequests} total requests`}
      />
      <Card
        label="Error rate"
        value={`${metrics.errorRatePct.toFixed(1)}%`}
        sub={`${metrics.errorCount} errors`}
        valueClass={errClass}
      />
      <Card
        label="Min / Max"
        value={`${metrics.minMs}ms / ${metrics.maxMs}ms`}
        sub={`Range: ${Math.max(0, metrics.maxMs - metrics.minMs)}ms`}
      />
    </div>
  );
}
