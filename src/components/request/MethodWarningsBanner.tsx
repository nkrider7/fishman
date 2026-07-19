import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import {
  getMethodWarnings,
  suggestQueryMigration,
  type MethodWarning,
} from "@/http-methods";
import type { RequestDraft } from "@/types/request";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface MethodWarningsProps {
  draft: RequestDraft;
  onApplySuggestion?: (changes: Partial<RequestDraft>) => void;
}

function WarningRow({
  warning,
  onSuggestJson,
}: {
  warning: MethodWarning;
  onSuggestJson?: () => void;
}) {
  const Icon = warning.severity === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
        warning.severity === "warning"
          ? "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300"
          : "border-border/60 bg-muted/40 text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div>{warning.message}</div>
        {warning.suggestion && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="opacity-80">{warning.suggestion}</span>
            {warning.suggestion.includes("application/json") && onSuggestJson && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={onSuggestJson}
              >
                Set Content-Type
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MethodWarningsBanner({
  draft,
  onApplySuggestion,
}: MethodWarningsProps) {
  const warnings = getMethodWarnings(draft);
  const migration = suggestQueryMigration(draft);

  if (warnings.length === 0 && !migration) return null;

  const ensureJsonContentType = () => {
    const headers = [...draft.headers];
    const idx = headers.findIndex((h) => h.key.toLowerCase() === "content-type");
    if (idx >= 0) {
      headers[idx] = {
        ...headers[idx],
        value: "application/json",
        enabled: true,
      };
    } else {
      headers.push({
        id: crypto.randomUUID(),
        key: "Content-Type",
        value: "application/json",
        enabled: true,
      });
    }
    onApplySuggestion?.({ headers });
  };

  return (
    <div className="space-y-1.5">
      {warnings.map((w) => (
        <WarningRow
          key={w.id}
          warning={w}
          onSuggestJson={
            w.suggestion?.includes("application/json")
              ? ensureJsonContentType
              : undefined
          }
        />
      ))}
      {migration && (
        <div className="flex items-start gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/5 px-2.5 py-2 text-xs text-cyan-800 dark:text-cyan-300">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div>{migration}</div>
            {onApplySuggestion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1.5 h-6 border-cyan-500/40 px-2 text-[10px]"
                onClick={() => onApplySuggestion({ method: "QUERY" })}
              >
                Convert to QUERY
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
