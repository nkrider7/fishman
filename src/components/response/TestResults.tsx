import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/utils/cn";
import type { ScriptTestResult } from "@/script-engine/types";

interface TestResultsProps {
  results: ScriptTestResult[];
}

export function TestResults({ results }: TestResultsProps) {
  if (results.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
        No test results yet
      </div>
    );
  }

  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-7 shrink-0 items-center gap-3 border-b border-border/40 px-3 text-[11px]">
        <span className="inline-flex items-center gap-1 text-emerald-500">
          <CheckCircle2 className="h-3 w-3" />
          {passed}
        </span>
        <span className="inline-flex items-center gap-1 text-destructive">
          <XCircle className="h-3 w-3" />
          {failed}
        </span>
        {skipped > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MinusCircle className="h-3 w-3" />
            {skipped}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {results.map((result) => (
          <TestResultRow
            key={`${result.name}-${result.durationMs}`}
            result={result}
          />
        ))}
      </div>
    </div>
  );
}

function TestResultRow({ result }: { result: ScriptTestResult }) {
  const [expanded, setExpanded] = useState(false);
  const Icon =
    result.status === "passed"
      ? CheckCircle2
      : result.status === "failed"
        ? XCircle
        : MinusCircle;

  return (
    <div className="border-b border-border/30">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] hover:bg-muted/25"
        onClick={() => result.error && setExpanded((v) => !v)}
      >
        {result.error ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3" />
        )}
        <Icon
          className={cn(
            "h-3 w-3 shrink-0",
            result.status === "passed" && "text-emerald-500",
            result.status === "failed" && "text-destructive",
            result.status === "skipped" && "text-muted-foreground",
          )}
        />
        <span className="flex-1 truncate">{result.name}</span>
        <span className="tabular-nums text-[10px] text-muted-foreground">
          {result.durationMs.toFixed(1)}ms
        </span>
      </button>
      {expanded && result.error && (
        <div className="bg-destructive/5 px-2 py-1.5 font-mono text-[10px] text-destructive">
          <p>{result.error.message}</p>
          {result.error.stack && (
            <pre className="mt-1 whitespace-pre-wrap opacity-80">
              {result.error.stack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
