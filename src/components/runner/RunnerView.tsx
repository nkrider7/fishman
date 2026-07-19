import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from "react-resizable-panels";
import {
  Play,
  Square,
  RotateCcw,
  Download,
  Upload,
  Plus,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  patchRunnerConfig,
  toggleRequestSelected,
  selectAllRequests,
  deselectAllRequests,
  resetRunnerConfig,
  clearRunnerResults,
  setRunnerFilter,
  setActiveResultId,
  reorderSelectedQueue,
  refreshRunnerQueue,
} from "@/store/slices/runnerSlice";
import {
  startCollectionRun,
  cancelCollectionRun,
  pickRunnerDataFile,
  downloadRunnerReport,
} from "@/store/thunks/runnerThunks";
import { saveRequestToDb } from "@/store/slices/collectionsSlice";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { buildRunnerQueue, parseTagInput } from "@/runner";
import type { RunnerQueueItem } from "@/runner/types";
import { createEmptyRequest } from "@/types/request";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";

type RunnerScreen = "setup" | "results";

function reorderIds(
  ids: string[],
  activeId: string,
  overId: string,
): string[] | null {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function RunnerQueueRow({
  item,
  index,
  total,
  checked,
  onMove,
  onToggle,
}: {
  item: RunnerQueueItem;
  index: number;
  total: number;
  checked: boolean;
  onMove: (requestId: string, direction: -1 | 1) => void;
  onToggle: (requestId: string) => void;
}) {
  const dragId = `runner-drag:${item.requestId}`;
  const dropId = `runner-drop:${item.requestId}`;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: dragId,
    data: { requestId: item.requestId },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId,
    data: { requestId: item.requestId },
  });

  const setRowRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div
      ref={setRowRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "flex items-center gap-2 border-b px-2 py-1.5 text-sm",
        checked ? "bg-accent/20" : "opacity-60",
        isOver && !isDragging && "bg-accent/40",
        isDragging && "relative z-10 opacity-80 shadow-md",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex flex-col">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={index === 0}
          onClick={() => onMove(item.requestId, -1)}
          aria-label="Move up"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={index === total - 1}
          onClick={() => onMove(item.requestId, 1)}
          aria-label="Move down"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <Checkbox
        checked={checked}
        onCheckedChange={() => onToggle(item.requestId)}
      />
      <span
        className={cn(
          "w-14 shrink-0 text-[10px] font-semibold uppercase",
          getMethodClass(item.method),
        )}
      >
        {item.method}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <span className="max-w-[30%] shrink-0 truncate text-[11px] text-muted-foreground">
        {item.folderPath || "root"}
      </span>
    </div>
  );
}

export function RunnerView() {
  const dispatch = useAppDispatch();
  const runner = useAppSelector((s) => s.runner);
  const folders = useAppSelector((s) => s.collections.folders);
  const requests = useAppSelector((s) => s.collections.requests);
  const envId = useAppSelector((s) => s.environments.activeGlobalEnvironmentId);
  const envName = useAppSelector(
    (s) =>
      s.environments.globalEnvironments.find((e) => e.id === envId)?.name ??
      "No environment",
  );

  const [screen, setScreen] = useState<RunnerScreen>("setup");
  const [creating, setCreating] = useState(false);

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "fishman-runner-v2",
    panelIds: ["config", "selection"],
    storage: localStorage,
  });

  const {
    defaultLayout: resultsLayout,
    onLayoutChanged: onResultsLayoutChanged,
  } = useDefaultLayout({
    id: "fishman-runner-results-v2",
    panelIds: ["results-list", "results-detail"],
    storage: localStorage,
  });

  const config = runner.config;
  const isRunning = runner.phase === "running";
  const selectedCount = runner.selectedRequestIds.length;

  // Keep queue membership/metadata in sync with the collection, but do not
  // reset user-chosen run order (arrows / drag).
  useEffect(() => {
    if (!config) return;
    const queue = buildRunnerQueue(
      config.collectionId,
      config.folderId,
      folders,
      requests,
    );
    const byId = new Map(runner.queue.map((q) => [q.requestId, q]));
    const nextIds = new Set(queue.map((q) => q.requestId));
    const membershipChanged =
      queue.length !== runner.queue.length ||
      runner.queue.some((q) => !nextIds.has(q.requestId)) ||
      queue.some((q) => !byId.has(q.requestId));
    const metaChanged = queue.some((q) => {
      const prev = byId.get(q.requestId);
      if (!prev) return false;
      return (
        prev.name !== q.name ||
        prev.method !== q.method ||
        prev.folderPath !== q.folderPath ||
        prev.tags.join("\0") !== q.tags.join("\0")
      );
    });
    if (membershipChanged || metaChanged) {
      dispatch(refreshRunnerQueue({ queue }));
    }
  }, [config, folders, requests, runner.queue, dispatch]);

  useEffect(() => {
    if (runner.phase === "running" || runner.phase === "completed") {
      setScreen("results");
    }
  }, [runner.phase]);

  const filteredResults = useMemo(() => {
    if (runner.filter === "all") return runner.results;
    return runner.results.filter((r) => r.status === runner.filter);
  }, [runner.results, runner.filter]);

  const counts = useMemo(() => {
    const all = runner.results.length;
    const passed = runner.results.filter((r) => r.status === "passed").length;
    const failed = runner.results.filter((r) => r.status === "failed").length;
    const skipped = runner.results.filter((r) => r.status === "skipped").length;
    return { all, passed, failed, skipped };
  }, [runner.results]);

  const activeResult = runner.results.find((r) => r.id === runner.activeResultId);

  const handleAddRequest = async () => {
    if (!config || creating) return;
    setCreating(true);
    try {
      const folderId = config.folderId ?? config.collectionId;
      const draft = createEmptyRequest("New Request");
      draft.collectionId = folderId;
      const saved = await dispatch(
        saveRequestToDb({ request: draft, collectionId: folderId }),
      ).unwrap();
      await dispatch(openRequestTab({ savedRequest: saved, forceNew: true }));
    } catch (error) {
      console.error("[fishman] runner add request failed", error);
    } finally {
      setCreating(false);
    }
  };

  const moveItem = (requestId: string, direction: -1 | 1) => {
    const ids = runner.queue.map((q) => q.requestId);
    const index = ids.indexOf(requestId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const copy = [...ids];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    dispatch(reorderSelectedQueue(copy));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleQueueDragEnd = (event: DragEndEvent) => {
    const activeRequestId = String(event.active.data.current?.requestId ?? "");
    const overRequestId = String(event.over?.data.current?.requestId ?? "");
    if (!activeRequestId || !overRequestId) return;
    const next = reorderIds(
      runner.queue.map((q) => q.requestId),
      activeRequestId,
      overRequestId,
    );
    if (next) dispatch(reorderSelectedQueue(next));
  };

  if (!config) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">No runner session</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Right-click a collection or folder in the sidebar and choose{" "}
          <span className="font-medium text-foreground">Run</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {config.collectionName}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Collection Runner · Env: {envName}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
          <button
            type="button"
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              screen === "setup"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setScreen("setup")}
          >
            Setup
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              screen === "results"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setScreen("results")}
            disabled={runner.results.length === 0 && !isRunning}
          >
            Results
            {counts.all > 0 ? ` (${counts.all})` : ""}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void dispatch(cancelCollectionRun())}
            >
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={selectedCount === 0}
              onClick={() => {
                setScreen("results");
                void dispatch(startCollectionRun());
              }}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Run {selectedCount}
            </Button>
          )}
        </div>
      </header>

      {screen === "setup" ? (
        <Group
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="config" defaultSize={36} minSize={28}>
            <div className="h-full space-y-4 overflow-auto p-4">
              <div>
                <h3 className="text-sm font-semibold">Run settings</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {runner.queue.length} request
                  {runner.queue.length === 1 ? "" : "s"} in scope
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delay">Delay between requests (ms)</Label>
                <Input
                  id="delay"
                  type="number"
                  min={0}
                  value={config.delayMs}
                  disabled={isRunning || config.parallel}
                  onChange={(e) =>
                    dispatch(
                      patchRunnerConfig({
                        delayMs: Math.max(0, Number(e.target.value) || 0),
                      }),
                    )
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="include-tags">Include tags</Label>
                  <Input
                    id="include-tags"
                    placeholder="smoke, regression"
                    value={config.includeTags.join(", ")}
                    onChange={(e) =>
                      dispatch(
                        patchRunnerConfig({
                          includeTags: parseTagInput(e.target.value),
                        }),
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exclude-tags">Exclude tags</Label>
                  <Input
                    id="exclude-tags"
                    placeholder="slow"
                    value={config.excludeTags.join(", ")}
                    onChange={(e) =>
                      dispatch(
                        patchRunnerConfig({
                          excludeTags: parseTagInput(e.target.value),
                        }),
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Data file (CSV / JSON)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void dispatch(pickRunnerDataFile())}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {config.dataFileName ?? "Select file"}
                  </Button>
                  {config.dataFileName && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        dispatch(
                          patchRunnerConfig({
                            dataFileName: undefined,
                            dataRows: undefined,
                          }),
                        )
                      }
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {config.dataRows && (
                  <p className="text-[11px] text-muted-foreground">
                    {config.dataRows.length} row
                    {config.dataRows.length === 1 ? "" : "s"} loaded into{" "}
                    <code className="rounded bg-muted px-1">iterationData</code>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="iterations">Iterations</Label>
                <Input
                  id="iterations"
                  type="number"
                  min={1}
                  value={config.iterations}
                  onChange={(e) =>
                    dispatch(
                      patchRunnerConfig({
                        iterations: Math.max(1, Number(e.target.value) || 1),
                      }),
                    )
                  }
                />
              </div>

              <ToggleRow
                label="Run in parallel"
                hint="Ignores delay and setNextRequest"
                checked={config.parallel}
                onChange={(checked) =>
                  dispatch(patchRunnerConfig({ parallel: checked }))
                }
              />

              {config.parallel && (
                <div className="space-y-2">
                  <Label htmlFor="concurrency">Concurrency</Label>
                  <Input
                    id="concurrency"
                    type="number"
                    min={1}
                    max={20}
                    value={config.concurrency}
                    onChange={(e) =>
                      dispatch(
                        patchRunnerConfig({
                          concurrency: Math.min(
                            20,
                            Math.max(1, Number(e.target.value) || 5),
                          ),
                        }),
                      )
                    }
                  />
                </div>
              )}

              <ToggleRow
                label="Stop on failure"
                checked={config.stopOnFailure}
                onChange={(checked) =>
                  dispatch(patchRunnerConfig({ stopOnFailure: checked }))
                }
              />
              <ToggleRow
                label="Fail on HTTP ≥ 400"
                hint="Off = assertion-driven (Postman-style)"
                checked={config.failOnHttpError}
                onChange={(checked) =>
                  dispatch(patchRunnerConfig({ failOnHttpError: checked }))
                }
              />
              <ToggleRow
                label="Save responses"
                checked={config.saveResponses}
                onChange={(checked) =>
                  dispatch(patchRunnerConfig({ saveResponses: checked }))
                }
              />

              <div className="flex flex-col gap-2 border-t pt-3">
                <Button
                  disabled={selectedCount === 0 || isRunning}
                  onClick={() => {
                    setScreen("results");
                    void dispatch(startCollectionRun());
                  }}
                >
                  <Play className="mr-1.5 h-4 w-4" />
                  Run {selectedCount} request
                  {selectedCount === 1 ? "" : "s"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => dispatch(resetRunnerConfig())}
                >
                  Reset settings
                </Button>
              </div>
            </div>
          </Panel>

          <Separator className="w-px bg-border" />

          <Panel id="selection" minSize={40}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {selectedCount} of {runner.queue.length} selected
                </span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => dispatch(selectAllRequests())}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => dispatch(deselectAllRequests())}
                >
                  Deselect
                </button>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      if (!config) return;
                      const queue = buildRunnerQueue(
                        config.collectionId,
                        config.folderId,
                        folders,
                        requests,
                      );
                      dispatch(refreshRunnerQueue({ queue }));
                    }}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7"
                    disabled={creating}
                    onClick={() => void handleAddRequest()}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add request
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {runner.queue.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm font-medium">No requests yet</p>
                    <p className="max-w-xs text-xs text-muted-foreground">
                      This collection is empty. Add a request here, then come
                      back to run it.
                    </p>
                    <Button
                      size="sm"
                      disabled={creating}
                      onClick={() => void handleAddRequest()}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      {creating ? "Creating…" : "Add request"}
                    </Button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleQueueDragEnd}
                  >
                    {runner.queue.map((item, index) => {
                      const checked = runner.selectedRequestIds.includes(
                        item.requestId,
                      );
                      return (
                        <RunnerQueueRow
                          key={item.requestId}
                          item={item}
                          index={index}
                          total={runner.queue.length}
                          checked={checked}
                          onMove={moveItem}
                          onToggle={(id) =>
                            dispatch(toggleRequestSelected(id))
                          }
                        />
                      );
                    })}
                  </DndContext>
                )}
              </div>
            </div>
          </Panel>
        </Group>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            {(
              [
                ["all", counts.all],
                ["passed", counts.passed],
                ["failed", counts.failed],
                ["skipped", counts.skipped],
              ] as const
            ).map(([key, count]) => (
              <button
                key={key}
                type="button"
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs capitalize",
                  runner.filter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
                onClick={() => dispatch(setRunnerFilter(key))}
              >
                {key} {count}
              </button>
            ))}

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {!isRunning && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setScreen("setup");
                    dispatch(clearRunnerResults());
                  }}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Back to setup
                </Button>
              )}
              {!isRunning && (
                <Button
                  size="sm"
                  onClick={() => void dispatch(startCollectionRun())}
                  disabled={selectedCount === 0}
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Run again
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={runner.results.length === 0}
                onClick={() => void dispatch(downloadRunnerReport("json"))}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                JSON
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={runner.results.length === 0}
                onClick={() => void dispatch(downloadRunnerReport("junit"))}
              >
                JUnit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={runner.results.length === 0}
                onClick={() => void dispatch(downloadRunnerReport("html"))}
              >
                HTML
              </Button>
            </div>
          </div>

          <Group
            orientation="horizontal"
            className="min-h-0 flex-1"
            defaultLayout={resultsLayout}
            onLayoutChanged={onResultsLayoutChanged}
          >
            <Panel id="results-list" defaultSize={40} minSize={28}>
              <div className="h-full overflow-auto">
                {filteredResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left text-sm hover:bg-accent/40",
                      runner.activeResultId === result.id && "bg-accent",
                      result.status === "failed" && "text-destructive",
                      result.status === "passed" &&
                        "text-emerald-600 dark:text-emerald-400",
                      result.status === "skipped" && "text-muted-foreground",
                      result.status === "running" && "text-foreground",
                    )}
                    onClick={() => dispatch(setActiveResultId(result.id))}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "w-12 shrink-0 text-[10px] font-semibold uppercase",
                          getMethodClass(result.method),
                        )}
                      >
                        {result.method}
                      </span>
                      <span className="truncate font-medium">
                        {result.folderPath
                          ? `${result.folderPath}/${result.name}`
                          : result.name}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {result.httpStatus ?? "—"} · {result.durationMs ?? 0}
                        ms
                      </span>
                    </div>
                    {result.errorMessage && (
                      <span className="truncate pl-14 text-[11px] opacity-80">
                        {result.errorMessage}
                      </span>
                    )}
                  </button>
                ))}
                {filteredResults.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {isRunning
                      ? "Running collection…"
                      : "No results in this filter."}
                  </p>
                )}
              </div>
            </Panel>
            <Separator className="w-px bg-border" />
            <Panel id="results-detail" minSize={35}>
              {activeResult ? (
                <div className="h-full space-y-3 overflow-auto p-4">
                  <div>
                    <div className="text-sm font-semibold">
                      {activeResult.folderPath
                        ? `${activeResult.folderPath}/${activeResult.name}`
                        : activeResult.name}
                    </div>
                    <div className="mt-1 break-all text-xs text-muted-foreground">
                      {activeResult.method} {activeResult.requestUrl ?? ""}
                    </div>
                    <div className="mt-1 text-xs">
                      {activeResult.status}
                      {activeResult.httpStatus != null
                        ? ` · HTTP ${activeResult.httpStatus}`
                        : ""}
                      {activeResult.durationMs != null
                        ? ` · ${activeResult.durationMs}ms`
                        : ""}
                      {` · iteration ${activeResult.iteration}`}
                    </div>
                  </div>

                  {activeResult.tests.length > 0 && (
                    <section className="space-y-1.5">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Tests
                      </h4>
                      {activeResult.tests.map((t, i) => (
                        <div
                          key={`${t.name}-${i}`}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs",
                            t.status === "passed" &&
                              "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
                            t.status === "failed" &&
                              "border-destructive/40 text-destructive",
                          )}
                        >
                          {t.status === "passed" ? "✓" : "✗"} {t.name}
                          {t.error?.message ? ` — ${t.error.message}` : ""}
                        </div>
                      ))}
                    </section>
                  )}

                  {activeResult.logs.length > 0 && (
                    <section className="space-y-1.5">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Console
                      </h4>
                      <pre className="max-h-36 overflow-auto rounded-md border bg-muted/30 p-2 text-[11px]">
                        {activeResult.logs
                          .map((l) => `[${l.level}] ${l.message}`)
                          .join("\n")}
                      </pre>
                    </section>
                  )}

                  {activeResult.responsePreview ? (
                    <>
                      <section className="space-y-1.5">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Response body
                        </h4>
                        <pre className="max-h-[40vh] overflow-auto rounded-md border bg-muted/30 p-2 text-[11px] whitespace-pre-wrap break-all">
                          {activeResult.responsePreview.body}
                        </pre>
                      </section>
                      <section className="space-y-1.5">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Headers
                        </h4>
                        <pre className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-[11px]">
                          {Object.entries(activeResult.responsePreview.headers)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join("\n")}
                        </pre>
                      </section>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {activeResult.status === "running"
                        ? "Running…"
                        : "No response body saved."}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                  Select a result to inspect response, tests, and logs.
                </div>
              )}
            </Panel>
          </Group>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        {hint ? (
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
