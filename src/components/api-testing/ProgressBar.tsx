import { cn } from "@/utils/cn";

interface ProgressBarProps {
  percent: number;
  running?: boolean;
  className?: string;
}

export function ProgressBar({ percent, running, className }: ProgressBarProps) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(width)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-200 ease-out",
          running && "animate-pulse",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
