interface ResourceCardProps {
  label: string;
  value: string;
  hint?: string;
}

export function ResourceCard({ label, value, hint }: ResourceCardProps) {
  return (
    <div className="flex min-h-[72px] flex-col justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {hint ? (
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}
