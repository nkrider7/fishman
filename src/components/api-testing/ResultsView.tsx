import { ArrowLeft, Square } from "lucide-react";
import type {
  ApiTestConfig,
  ApiTestRunSnapshot,
  ResultsTab,
} from "@/api-testing";
import { TEST_TYPE_LABELS } from "@/api-testing";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { ProgressBar } from "./ProgressBar";
import { MetricCards } from "./MetricCards";
import { DistributionChart } from "./DistributionChart";
import { TimelineTable } from "./TimelineTable";
import { ErrorsList } from "./ErrorsList";

interface ResultsViewProps {
  config: ApiTestConfig;
  run: ApiTestRunSnapshot;
  resultsTab: ResultsTab;
  onResultsTab: (tab: ResultsTab) => void;
  onStop: () => void;
  onBack: () => void;
  running: boolean;
}

export function ResultsView({
  config,
  run,
  resultsTab,
  onResultsTab,
  onStop,
  onBack,
  running,
}: ResultsViewProps) {
  const statusLabel =
    run.phase === "running"
      ? "Running"
      : run.phase === "cancelled"
        ? "Stopped"
        : run.phase === "failed"
          ? "Failed"
          : "Completed";

  const statusDot =
    run.phase === "running"
      ? "bg-amber-500 animate-pulse"
      : run.phase === "completed"
        ? "bg-emerald-500"
        : run.phase === "failed"
          ? "bg-destructive"
          : "bg-muted-foreground";

  const statusCodes = Object.entries(run.metrics.statusCounts)
    .map(([code, n]) => `${code}: ${n}`)
    .join(", ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {!running ? (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Configuration
          </button>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className={cn("h-2 w-2 rounded-full", statusDot)} />
              {statusLabel}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(run.elapsedMs / 1000)}s
            </span>
            <span className="tabular-nums text-muted-foreground">
              {run.currentVus} VUs
            </span>
            <span className="tabular-nums text-muted-foreground">
              {run.metrics.totalRequests} requests
            </span>
            <span className="tabular-nums text-muted-foreground">
              {run.metrics.errorCount} errors
            </span>
            {run.spikePhase ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {run.spikePhase}
              </span>
            ) : null}
          </div>
          {running ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 gap-1.5"
              onClick={onStop}
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </Button>
          ) : null}
        </div>

        <ProgressBar percent={run.progressPct} running={running} />

        {run.breakingPoint ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Breaking point at {run.breakingPoint.atElapsedSec}s ·{" "}
            {run.breakingPoint.vus} VUs — {run.breakingPoint.reason}
          </div>
        ) : null}

        <MetricCards metrics={run.metrics} />

        <DistributionChart
          buckets={run.metrics.buckets}
          total={run.metrics.totalRequests}
        />

        <div>
          <div className="mb-2 flex gap-3 border-b border-border text-xs">
            {(
              [
                ["summary", "Summary"],
                ["timeline", "Timeline"],
                ["errors", "Errors"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "border-b-2 px-0.5 pb-1.5 transition-colors",
                  resultsTab === id
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => onResultsTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {resultsTab === "summary" ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
              <SummaryRow
                label="Test type"
                value={TEST_TYPE_LABELS[config.testType].split("—")[0]?.trim() ?? config.testType}
              />
              <SummaryRow
                label="Duration"
                value={`${Math.round(run.elapsedMs / 1000)}s`}
              />
              <SummaryRow label="URL" value={config.url || "—"} mono />
              <SummaryRow
                label="Status codes"
                value={statusCodes || "—"}
              />
            </div>
          ) : null}
          {resultsTab === "timeline" ? (
            <TimelineTable rows={run.timeline} />
          ) : null}
          {resultsTab === "errors" ? (
            <ErrorsList errors={run.errors} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 break-all text-foreground",
          mono && "font-mono text-[11px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
