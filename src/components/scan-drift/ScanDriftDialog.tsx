import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitCompareArrows,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  applyScanDriftSync,
  checkScanDrift,
  closeScanDrift,
  setDriftFilter,
  setDriftSelectedIds,
  toggleDriftItem,
  type DriftFilter,
} from "@/store/slices/scanDriftSlice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";
import type { DriftItem } from "@/scan-drift";

const FILTERS: { id: DriftFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "added", label: "Added" },
  { id: "removed", label: "Removed" },
  { id: "changed", label: "Changed" },
];

export function ScanDriftDialog() {
  const open = useAppSelector((s) => s.scanDrift.open);
  if (!open) return null;
  return <ScanDriftDialogOpen />;
}

function ScanDriftDialogOpen() {
  const dispatch = useAppDispatch();
  const {
    link,
    report,
    selectedItemIds,
    filter,
    scanning,
    syncing,
    progress,
    error,
    stale,
  } = useAppSelector((s) => s.scanDrift);

  const selected = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);

  const visibleItems = useMemo(() => {
    if (!report) return [];
    if (filter === "all") {
      return report.items.filter((i) => i.kind !== "unchanged");
    }
    return report.items.filter((i) => i.kind === filter);
  }, [report, filter]);

  const syncableVisible = visibleItems.filter(
    (i) =>
      i.kind === "added" ||
      i.kind === "removed" ||
      (i.kind === "changed" && !i.locked),
  );

  const handleClose = () => dispatch(closeScanDrift());

  const handleRescan = () => {
    void dispatch(checkScanDrift());
  };

  const handleSelectAllVisible = () => {
    dispatch(setDriftSelectedIds(syncableVisible.map((i) => i.id)));
  };

  const handleSyncSelected = () => {
    const removedCount = report?.items.filter(
      (i) => selected.has(i.id) && i.kind === "removed",
    ).length;
    if (removedCount && removedCount > 0) {
      const ok = window.confirm(
        `Move ${removedCount} scanner-owned request${removedCount === 1 ? "" : "s"} to “_Removed by scan”?`,
      );
      if (!ok) return;
    }
    void dispatch(applyScanDriftSync({ mode: "selected" }));
  };

  const handleSyncSafe = () => {
    void dispatch(applyScanDriftSync({ mode: "safe" }));
  };

  const inSync =
    report &&
    report.summary.added === 0 &&
    report.summary.removed === 0 &&
    report.summary.changed === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4" />
            Scan Drift
          </DialogTitle>
          <p className="truncate text-xs text-muted-foreground">
            {link?.collectionName ?? "Collection"}
            {link ? ` · ${projectShort(link.projectPath || link.githubUrl || "")}` : null}
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRescan}
              disabled={scanning || syncing}
            >
              {scanning ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {report ? "Rescan" : "Check for drift"}
            </Button>
            {stale ? (
              <Badge variant="outline" className="text-[10px]">
                Code changed — rescan
              </Badge>
            ) : null}
            {report ? (
              <>
                <SummaryChip label="Added" count={report.summary.added} tone="added" />
                <SummaryChip
                  label="Removed"
                  count={report.summary.removed}
                  tone="removed"
                />
                <SummaryChip
                  label="Changed"
                  count={report.summary.changed}
                  tone="changed"
                />
              </>
            ) : null}
          </div>

          {progress && scanning ? (
            <p className="text-xs text-muted-foreground">
              {progress.message} ({progress.percent}%)
            </p>
          ) : null}

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {report && !scanning ? (
            <>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => dispatch(setDriftFilter(f.id))}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors",
                      filter === f.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="ml-auto text-xs text-primary hover:underline"
                  onClick={handleSelectAllVisible}
                >
                  Select visible
                </button>
              </div>

              {inSync && filter === "all" ? (
                <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  Collection is in sync with code
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                  {visibleItems.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">
                      No items in this filter
                    </p>
                  ) : (
                    visibleItems.map((item) => (
                      <DriftRow
                        key={item.id}
                        item={item}
                        checked={selected.has(item.id)}
                        onToggle={() => dispatch(toggleDriftItem(item.id))}
                      />
                    ))
                  )}
                </div>
              )}
            </>
          ) : !scanning && !error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Compare this collection to routes in the linked project.
            </p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t px-5 py-3">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            disabled={!report || syncing || scanning}
            onClick={handleSyncSafe}
          >
            Sync safe
          </Button>
          <Button
            disabled={
              !report || syncing || scanning || selectedItemIds.length === 0
            }
            onClick={handleSyncSelected}
          >
            {syncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Sync selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DriftRow({
  item,
  checked,
  onToggle,
}: {
  item: DriftItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const canSelect =
    item.kind === "added" ||
    item.kind === "removed" ||
    (item.kind === "changed" && !item.locked);

  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-b-0",
        !canSelect && "cursor-default opacity-70",
      )}
    >
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={!canSelect}
        onCheckedChange={() => canSelect && onToggle()}
      />
      <span
        className={cn(
          "mt-0.5 w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold",
          getMethodClass(String(item.method)),
        )}
      >
        {item.method}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-mono text-xs">{item.path}</span>
          <KindBadge kind={item.kind} />
          {item.locked ? (
            <Badge variant="outline" className="text-[10px]">
              Locked
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.summary}</p>
        {item.sourceFile ? (
          <p className="truncate font-mono text-[10px] text-muted-foreground/80">
            {item.sourceFile}
          </p>
        ) : null}
      </div>
    </label>
  );
}

function KindBadge({ kind }: { kind: DriftItem["kind"] }) {
  const label =
    kind === "manual_only"
      ? "Manual"
      : kind.charAt(0).toUpperCase() + kind.slice(1);
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        kind === "added" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        kind === "removed" && "bg-red-500/15 text-red-700 dark:text-red-400",
        kind === "changed" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        kind === "manual_only" && "bg-muted text-muted-foreground",
        kind === "unchanged" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function SummaryChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "added" | "removed" | "changed";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "added" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        tone === "removed" && "bg-red-500/15 text-red-700 dark:text-red-400",
        tone === "changed" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      )}
    >
      {label} {count}
    </span>
  );
}

function projectShort(path: string): string {
  if (!path) return "";
  const norm = path.replace(/\\/g, "/");
  const parts = norm.split("/");
  return parts.slice(-2).join("/") || norm;
}
