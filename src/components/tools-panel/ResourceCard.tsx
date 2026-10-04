import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

interface ResourceCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  /** 0–100 for CPU-style progress bar */
  progressPercent?: number | null;
}

export function ResourceCard({
  label,
  value,
  hint,
  icon: Icon,
  iconClassName,
  progressPercent,
}: ResourceCardProps) {
  const showProgress =
    progressPercent != null &&
    !Number.isNaN(progressPercent) &&
    progressPercent >= 0;

  return (
    <div className="group flex min-h-[72px] flex-col justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <span
            className={cn(
              "rounded-full bg-muted/50 p-1.5 text-muted-foreground transition-colors group-hover:text-foreground",
              iconClassName,
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {showProgress ? (
        <div
          className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
          aria-hidden
        >
          <div
            className={cn(
              "h-full rounded-full bg-sky-500/80 transition-all",
              progressPercent > 80 && "bg-amber-500/80",
              progressPercent > 95 && "bg-destructive/80",
            )}
            style={{ width: `${Math.min(progressPercent, 100)}%` }}
          />
        </div>
      ) : null}
      {hint ? (
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}
