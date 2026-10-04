import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface NetworkSectionHeaderProps {
  title: string;
  children?: ReactNode;
  className?: string;
}

export function NetworkSectionHeader({
  title,
  children,
  className,
}: NetworkSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3",
        className,
      )}
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children ? (
        <div className="flex shrink-0 items-center gap-1.5">{children}</div>
      ) : null}
    </div>
  );
}
