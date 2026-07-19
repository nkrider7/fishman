import { Trash2, Terminal } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ScriptError, ScriptLogEntry, VariableChange } from "@/script-engine/types";
import type { ScriptErrorPhase } from "@/script-engine/utils/script-errors";
import { Button } from "@/components/ui/button";

interface ScriptConsoleProps {
  logs: ScriptLogEntry[];
  variableChanges?: VariableChange[];
  error?: ScriptError;
  errorPhase?: ScriptErrorPhase;
  onClear?: () => void;
  compact?: boolean;
}

const LEVEL_STYLES: Record<ScriptLogEntry["level"], string> = {
  log: "text-foreground",
  info: "text-blue-400",
  warn: "text-amber-400",
  error: "text-destructive",
  debug: "text-muted-foreground",
  table: "text-foreground",
};

const LEVEL_ICONS: Record<ScriptLogEntry["level"], string> = {
  log: "›",
  info: "i",
  warn: "⚠",
  error: "✕",
  debug: "·",
  table: "⊞",
};

export function ScriptConsole({
  logs,
  variableChanges = [],
  error,
  errorPhase,
  onClear,
  compact = false,
}: ScriptConsoleProps) {
  const hasOutput = logs.length > 0 || variableChanges.length > 0 || !!error;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-muted/10">
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-2 py-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          Console
        </div>
        {onClear && hasOutput && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={onClear}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      <div className={cn("flex-1 overflow-auto font-mono", compact ? "text-[11px]" : "text-xs")}>
        {!hasOutput ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-muted-foreground">
            Send a request to see script output — e.g. &quot;Saved authToken&quot; or errors
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {variableChanges.map((change) => (
              <div
                key={`${change.scope}-${change.key}`}
                className="flex items-start gap-2 bg-emerald-500/5 px-3 py-1.5"
              >
                <span className="shrink-0 text-emerald-500">✓</span>
                <span className="text-emerald-400">
                  Set <span className="font-semibold">{change.key}</span>
                  <span className="text-muted-foreground"> ({change.scope})</span>
                  {" = "}
                  <span className="text-foreground">
                    {maskSensitiveValue(change.key, change.value)}
                  </span>
                </span>
              </div>
            ))}

            {error && (
              <div className="bg-destructive/5 px-3 py-2 text-destructive">
                <div className="font-semibold">
                  Script error{errorPhase ? ` · ${errorPhase}` : ""}
                </div>
                <div className="mt-0.5">{error.message}</div>
                {error.stack && (
                  <pre className="mt-1 whitespace-pre-wrap text-[10px] opacity-80">
                    {error.stack}
                  </pre>
                )}
              </div>
            )}

            {logs.map((log) => (
              <div
                key={log.id}
                className="px-3 py-1.5 hover:bg-muted/20"
              >
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="uppercase">{log.scriptType}</span>
                  <span className={cn("font-bold", LEVEL_STYLES[log.level])}>
                    {LEVEL_ICONS[log.level]} {log.level}
                  </span>
                </div>
                <pre
                  className={cn(
                    "mt-0.5 whitespace-pre-wrap",
                    LEVEL_STYLES[log.level],
                  )}
                >
                  {log.message}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function maskSensitiveValue(key: string, value: string): string {
  const sensitive = /token|password|secret|key|auth/i.test(key);
  if (!sensitive || value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
