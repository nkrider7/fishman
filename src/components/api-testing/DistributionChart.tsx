import {
  LATENCY_BUCKET_KEYS,
  LATENCY_BUCKET_LABELS,
  type LatencyBuckets,
} from "@/api-testing";
import { cn } from "@/utils/cn";

interface DistributionChartProps {
  buckets: LatencyBuckets;
  total: number;
}

const BUCKET_BAR: Record<(typeof LATENCY_BUCKET_KEYS)[number], string> = {
  lt50: "bg-emerald-500/80",
  b50_100: "bg-emerald-500/60",
  b100_200: "bg-primary/70",
  b200_500: "bg-amber-500",
  b500_1000: "bg-orange-600/90",
  gt1000: "bg-destructive",
};

export function DistributionChart({ buckets, total }: DistributionChartProps) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Response time distribution
      </p>
      <div className="space-y-1.5">
        {LATENCY_BUCKET_KEYS.map((key) => {
          const count = buckets[key];
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={key} className="flex items-center gap-2 text-[11px]">
              <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                {LATENCY_BUCKET_LABELS[key]}
              </span>
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300",
                    BUCKET_BAR[key],
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {count} ({Math.round(pct)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
