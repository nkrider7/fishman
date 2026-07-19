import { Badge } from "@/components/ui/badge";
import {
  getMethodDefinition,
  type MethodDefinition,
} from "@/http-methods";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";

interface MethodSemanticsProps {
  method: string;
  className?: string;
  id?: string;
}

function semanticBadgeClass(def: MethodDefinition): string {
  if (def.safe && def.idempotent) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (def.semanticKind === "mutation") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400";
}

export function MethodSemantics({ method, className, id }: MethodSemanticsProps) {
  const def = getMethodDefinition(method);
  if (!def) return null;

  const hint =
    def.semanticKind === "read"
      ? "This request is expected to retrieve data without changing server state."
      : def.tooltip;

  return (
    <div
      id={id}
      className={cn(
        "rounded-md border border-border/60 bg-muted/30 px-2.5 py-2",
        className,
      )}
      title={hint}
    >
      <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground">
        <span className={cn("mr-1.5 font-semibold", getMethodClass(def.name))}>
          {def.name}
        </span>
        {def.description}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {def.safe && (
          <Badge
            variant="outline"
            className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
          >
            Safe
          </Badge>
        )}
        {def.idempotent && (
          <Badge
            variant="outline"
            className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
          >
            Idempotent
          </Badge>
        )}
        {def.supportsBody && (
          <Badge
            variant="outline"
            className="h-5 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
          >
            Request Body Supported
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn(
            "h-5 px-1.5 text-[10px] font-medium",
            semanticBadgeClass(def),
          )}
        >
          {def.semanticLabel}
        </Badge>
      </div>
    </div>
  );
}
