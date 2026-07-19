import { useMemo, useState } from "react";
import { ArrowLeft, Copy, Play, Square } from "lucide-react";
import type {
  ApiTestConfig,
  ApiTestRunSnapshot,
  ResultsTab,
} from "@/api-testing";
import {
  TEST_TYPE_LABELS,
  describeVuProfile,
  formatRunSummary,
  formatStatusCounts,
} from "@/api-testing";
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
  onRunAgain: () => void;
  running: boolean;
}

function statusPresentation(run: ApiTestRunSnapshot): {
  label: string;
  dot: string;
  chip: string;
} {
  if (run.phase === "stopping") {
    return {
      label: "Stopping…",
      dot: "bg-amber-500 animate-pulse",
      chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (run.phase === "running") {
    return {
      label: "Running",
      dot: "bg-amber-500 animate-pulse",
      chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (run.phase === "cancelled") {
    return {
      label: "Stopped",
      dot: "bg-muted-foreground",
      chip: "border-border bg-muted text-muted-foreground",
    };
  }
  if (run.phase === "failed") {
    return {
      label: "Failed",
      dot: "bg-destructive",
      chip: "border-destructive/40 bg-destructive/10 text-destructive",
    };
  }
  if (run.breakingPoint) {
    return {
      label: "Breaking point",
      dot: "bg-rose-500",
      chip: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    };
  }
  return {
    label: "Completed",
    dot: "bg-emerald-500",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
}

export function ResultsView({
  config,
  run,
  resultsTab,
  onResultsTab,
  onStop,
  onBack,
  onRunAgain,
  running,
}: ResultsViewProps) {
  const status = statusPresentation(run);
  const [copied, setCopied] = useState(false);

  const typeLabel = useMemo(
    () =>
      TEST_TYPE_LABELS[config.testType].split("—")[0]?.trim() ??
      config.testType,
    [config.testType],
  );

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(formatRunSummary(config, run));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {!running ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onBack}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Configuration
            </button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={onRunAgain}
            >
              <Play className="h-3 w-3" />
              Run again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => void copySummary()}
            >
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy summary"}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
                status.chip,
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", status.dot)} />
              {status.label}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(run.elapsedMs / 1000)}s / {config.durationSec}s
            </span>
            <span className="tabular-nums text-muted-foreground">
              {run.currentVus} VUs
            </span>
            <span className="tabular-nums text-muted-foreground">
              {run.metrics.totalRequests} requests
            </span>
            <span className="tabular-nums text-muted-foreground">
              {run.metrics.throughputRps} req/s
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
              disabled={run.phase === "stopping"}
            >
              <Square className="h-3 w-3 fill-current" />
              {run.phase === "stopping" ? "Stopping…" : "Stop"}
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

        {config.testType === "assertions" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AssertCard
              label="Passed"
              value={run.metrics.assertionPassCount}
              tone="pass"
            />
            <AssertCard
              label="Failed"
              value={run.metrics.assertionFailCount}
              tone="fail"
            />
            <AssertCard
              label="Expect status"
              value={config.expectedStatus}
              tone="neutral"
            />
            <AssertCard
              label="Max latency"
              value={`${config.maxLatencyMs}ms`}
              tone="neutral"
            />
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
                {id === "errors" && run.metrics.totalErrorSamples > 0
                  ? ` (${run.metrics.totalErrorSamples})`
                  : ""}
              </button>
            ))}
          </div>

          {resultsTab === "summary" ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
              <SummaryRow label="Test type" value={typeLabel} />
              <SummaryRow
                label="Method"
                value={`${config.method} ${config.url || "—"}`}
                mono
              />
              <SummaryRow
                label="Duration"
                value={`${(run.elapsedMs / 1000).toFixed(1)}s of ${config.durationSec}s configured`}
              />
              <SummaryRow
                label="VUs"
                value={describeVuProfile(config)}
              />
              <SummaryRow
                label="Requests"
                value={`${run.metrics.totalRequests} · ${run.metrics.throughputRps} req/s`}
              />
              <SummaryRow
                label="Error rate"
                value={`${run.metrics.errorRatePct.toFixed(1)}% (${run.metrics.errorCount})`}
              />
              <SummaryRow
                label="Latency"
                value={`avg ${run.metrics.avgMs} · p50 ${run.metrics.p50Ms} · p95 ${run.metrics.p95Ms} · p99 ${run.metrics.p99Ms} ms`}
              />
              <SummaryRow
                label="Status codes"
                value={formatStatusCounts(run.metrics.statusCounts)}
              />
            </div>
          ) : null}
          {resultsTab === "timeline" ? (
            <TimelineTable rows={run.timeline} />
          ) : null}
          {resultsTab === "errors" ? (
            <ErrorsList
              errors={run.errors}
              totalCount={run.metrics.totalErrorSamples}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AssertCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "pass" | "fail" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "pass" &&
          "border-emerald-500/30 bg-emerald-500/[0.06]",
        tone === "fail" && "border-destructive/30 bg-destructive/10",
        tone === "neutral" && "border-border bg-card",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "pass" && "text-emerald-600 dark:text-emerald-400",
          tone === "fail" && "text-destructive",
        )}
      >
        {value}
      </p>
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
