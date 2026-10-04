import {
  FolderSearch,
  Loader2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  applyEnvDetect,
  clearEnvDetectSelection,
  closeEnvDetect,
  runEnvDetectScan,
  selectAllEnvDetect,
  selectHighConfidenceEnvDetect,
  setEnvDetectConflictPolicy,
  setEnvDetectEnvName,
  toggleEnvDetectId,
} from "@/store/slices/envDetectSlice";
import { setEnvironmentManagerOpen } from "@/store/slices/uiSlice";
import { sourceKindLabel } from "@/env-detect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

export function EnvDetectDialog() {
  const open = useAppSelector((s) => s.envDetect.open);
  if (!open) return null;
  return <EnvDetectDialogOpen />;
}

function EnvDetectDialogOpen() {
  const dispatch = useAppDispatch();
  const {
    scanning,
    applying,
    report,
    selectedIds,
    envName,
    conflictPolicy,
    error,
  } = useAppSelector((s) => s.envDetect);
  const projectPath = useAppSelector((s) => s.git.projectPath);
  const workspaceRootPath = useAppSelector((s) => s.git.workspaceRootPath);

  const selected = new Set(selectedIds);
  const okSources = report?.sources.filter((s) => s.ok) ?? [];
  const failedSources = report?.sources.filter((s) => !s.ok) ?? [];

  const handleClose = () => dispatch(closeEnvDetect());

  const handleApply = () => {
    void dispatch(applyEnvDetect()).then((result) => {
      if (applyEnvDetect.fulfilled.match(result)) {
        dispatch(setEnvironmentManagerOpen(true));
      }
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderSearch className="h-4 w-4 text-muted-foreground" />
            Detect environment from project
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Scan{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
              {projectPath ?? "…"}
            </code>{" "}
            for{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.env</code>{" "}
            files, then write{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
              {workspaceRootPath
                ? "environments/<name>.json"
                : "global environment"}
            </code>
            {workspaceRootPath ? (
              <>
                {" "}
                (+ gitignored{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                  *.secret.json
                </code>
                ).
              </>
            ) : (
              "."
            )}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {scanning ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Scanning project…
            </div>
          ) : report ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Environment name
                  <Input
                    value={envName}
                    onChange={(e) =>
                      dispatch(setEnvDetectEnvName(e.target.value))
                    }
                    className="h-8 text-xs font-normal normal-case tracking-normal"
                    aria-label="Environment name"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={conflictPolicy === "overwrite"}
                    onCheckedChange={(checked) =>
                      dispatch(
                        setEnvDetectConflictPolicy(
                          checked === true ? "overwrite" : "skip",
                        ),
                      )
                    }
                  />
                  Overwrite existing values
                </label>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Sources
                </div>
                {okSources.length === 0 && failedSources.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                    No dotenv files found. Looked for:{" "}
                    {report.searchedPatterns.join(", ")}
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {okSources.map((s) => (
                      <Badge
                        key={s.path}
                        variant="secondary"
                        className="font-normal"
                      >
                        {s.path}
                        {typeof s.rawCount === "number"
                          ? ` (${s.rawCount})`
                          : ""}
                      </Badge>
                    ))}
                    {failedSources.map((s) => (
                      <Badge
                        key={s.path}
                        variant="outline"
                        className="border-destructive/40 font-normal text-destructive"
                        title={s.error}
                      >
                        {s.path} failed
                      </Badge>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Proposed variables ({selectedIds.length} selected)
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => dispatch(selectHighConfidenceEnvDetect())}
                    >
                      High confidence
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => dispatch(selectAllEnvDetect())}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => dispatch(clearEnvDetectSelection())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {report.variables.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    Nothing to propose from the files found.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-md border">
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.2fr)_72px_88px] gap-2 border-b bg-muted/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span />
                      <span>Key</span>
                      <span>Value</span>
                      <span>Dest</span>
                      <span>Source</span>
                    </div>
                    <ul className="max-h-64 divide-y overflow-y-auto">
                      {report.variables.map((v) => {
                        const checked = selected.has(v.id);
                        const masked =
                          v.secret && v.value
                            ? "•".repeat(Math.min(12, Math.max(4, v.value.length)))
                            : v.value || "—";
                        return (
                          <li
                            key={v.id}
                            className={cn(
                              "grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.2fr)_72px_88px] items-center gap-2 px-2 py-1.5 text-xs",
                              !v.enabled && "opacity-60",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                dispatch(toggleEnvDetectId(v.id))
                              }
                              aria-label={`Select ${v.key}`}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {`{{${v.key}}}`}
                              </div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {v.confidence}
                                {v.source.originalKey &&
                                v.source.originalKey !== v.key
                                  ? ` · from ${v.source.originalKey}`
                                  : ""}
                                {v.aliasOf ? ` · alias of ${v.aliasOf}` : ""}
                              </div>
                            </div>
                            <div
                              className="truncate font-mono text-[11px] text-muted-foreground"
                              title={v.secret ? undefined : v.value}
                            >
                              {masked}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              {v.secret ? (
                                <>
                                  <Shield className="h-3 w-3" />
                                  secret
                                </>
                              ) : (
                                "public"
                              )}
                            </div>
                            <div
                              className="truncate text-[10px] text-muted-foreground"
                              title={v.source.path}
                            >
                              {sourceKindLabel(v.source.kind)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No scan results yet.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={scanning || applying}
            onClick={() => void dispatch(runEnvDetectScan())}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Rescan
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={
                scanning ||
                applying ||
                !report ||
                selectedIds.length === 0
              }
              onClick={handleApply}
            >
              {applying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Applying…
                </>
              ) : (
                `Apply ${selectedIds.length || ""}`
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
