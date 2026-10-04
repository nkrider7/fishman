import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  applyOpenApiSync,
  checkOpenApiDrift,
  closeOpenApiSync,
  setOpenApiFilter,
  setOpenApiSelectedIds,
  toggleOpenApiItem,
  type OpenApiFilter,
} from "@/store/slices/openapiSlice";
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

const FILTERS: { id: OpenApiFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "added", label: "Added" },
  { id: "removed", label: "Removed" },
  { id: "changed", label: "Changed" },
];

export function OpenApiSyncDialog() {
  const open = useAppSelector((s) => s.openapi.syncOpen);
  if (!open) return null;
  return <OpenApiSyncDialogOpen />;
}

function OpenApiSyncDialogOpen() {
  const dispatch = useAppDispatch();
  const { link, report, selectedItemIds, filter, checking, syncing, error } =
    useAppSelector((s) => s.openapi);

  const selected = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);

  const visibleItems = useMemo(() => {
    if (!report) return [] as DriftItem[];
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

  const inSync =
    !!report &&
    report.summary.added === 0 &&
    report.summary.removed === 0 &&
    report.summary.changed === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && dispatch(closeOpenApiSync())}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileJson className="h-4 w-4" />
            OpenAPI Sync
          </DialogTitle>
          <p className="truncate text-xs text-muted-foreground">
            {link?.collectionName ?? link?.title ?? "Collection"}
            {link
              ? ` · ${shortLabel(link.specUrl || link.filePath || "")}`
              : null}
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={checking || syncing}
              onClick={() => void dispatch(checkOpenApiDrift())}
            >
              {checking ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {report ? "Recheck" : "Check for updates"}
            </Button>
            {report ? (
              <>
                <SummaryChip
                  label="Added"
                  count={report.summary.added}
                  tone="added"
                />
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

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {inSync ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Collection is in sync with the OpenAPI spec.
            </div>
          ) : null}

          {report ? (
            <>
              <div className="flex flex-wrap items-center gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] transition-colors",
                      filter === f.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => dispatch(setOpenApiFilter(f.id))}
                  >
                    {f.label}
                  </button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 text-[11px]"
                  disabled={syncableVisible.length === 0}
                  onClick={() =>
                    dispatch(
                      setOpenApiSelectedIds(syncableVisible.map((i) => i.id)),
                    )
                  }
                >
                  Select visible
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                {visibleItems.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
                    No items in this filter.
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {visibleItems.map((item) => {
                      const syncable =
                        item.kind === "added" ||
                        item.kind === "removed" ||
                        (item.kind === "changed" && !item.locked);
                      return (
                        <li
                          key={item.id}
                          className="flex items-start gap-2 px-3 py-2 text-[11px]"
                        >
                          <Checkbox
                            checked={selected.has(item.id)}
                            disabled={!syncable}
                            className="mt-0.5"
                            onCheckedChange={() =>
                              dispatch(toggleOpenApiItem(item.id))
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] capitalize"
                              >
                                {item.kind.replace("_", " ")}
                              </Badge>
                              <span
                                className={cn(
                                  "font-semibold uppercase",
                                  getMethodClass(String(item.method)),
                                )}
                              >
                                {item.method}
                              </span>
                              <span className="truncate font-mono text-muted-foreground">
                                {item.path}
                              </span>
                            </div>
                            <p className="mt-0.5 text-muted-foreground">
                              {item.summary}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : !checking && !error ? (
            <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-[11px] text-muted-foreground">
              Click “Check for updates” to compare this collection with the
              linked OpenAPI/Swagger spec.
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch(closeOpenApiSync())}
          >
            Close
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!report || syncing || checking}
              onClick={() => void dispatch(applyOpenApiSync({ mode: "safe" }))}
            >
              Sync safe
            </Button>
            <Button
              size="sm"
              disabled={
                !report || syncing || checking || selectedItemIds.length === 0
              }
              onClick={() => {
                const removedCount = report?.items.filter(
                  (i) => selected.has(i.id) && i.kind === "removed",
                ).length;
                if (removedCount && removedCount > 0) {
                  const ok = window.confirm(
                    `Move ${removedCount} OpenAPI-owned request${removedCount === 1 ? "" : "s"} to “_Removed by OpenAPI”?`,
                  );
                  if (!ok) return;
                }
                void dispatch(applyOpenApiSync({ mode: "selected" }));
              }}
            >
              {syncing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Sync selected
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const toneClass =
    tone === "added"
      ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
      : tone === "removed"
        ? "border-destructive/40 text-destructive"
        : "border-amber-500/40 text-amber-600 dark:text-amber-400";
  return (
    <Badge variant="outline" className={cn("text-[10px]", toneClass)}>
      {label} {count}
    </Badge>
  );
}

function shortLabel(value: string): string {
  if (!value) return "";
  if (value.length <= 48) return value;
  return `…${value.slice(-46)}`;
}
