import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderSearch,
  Loader2,
  ScanSearch,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  closeScanner,
  deselectAllEndpoints,
  importScanResult,
  pickProjectFolder,
  runBackendScan,
  selectAllEndpoints,
  setBaseUrl,
  setCollectionName,
  toggleEndpointSelection,
} from "@/store/slices/scannerSlice";
import {
  collapseAllTreeFolders,
  fetchCollections,
} from "@/store/slices/collectionsSlice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ScannerDialog() {
  const dispatch = useAppDispatch();
  const {
    open,
    step,
    projectPath,
    collectionName,
    baseUrl,
    progress,
    result,
    selectedEndpointIds,
    error,
  } = useAppSelector((state) => state.scanner);

  const selectedCount = selectedEndpointIds.length;
  const totalCount = result?.endpoints.length ?? 0;

  const groupedEndpoints = useMemo(() => {
    if (!result) return [];
    const groups = new Map<string, typeof result.endpoints>();
    for (const ep of result.endpoints) {
      const key = ep.folder.join(" / ") || "General";
      const list = groups.get(key) ?? [];
      list.push(ep);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [result]);

  const handlePickFolder = () => {
    dispatch(pickProjectFolder());
  };

  const handleScan = () => {
    if (!projectPath) return;
    dispatch(runBackendScan({ projectPath, baseUrl }));
  };

  const handleImport = async () => {
    if (!result) return;
    await dispatch(
      importScanResult({
        result,
        collectionName,
        baseUrl,
        selectedEndpointIds,
      }),
    );
    await dispatch(fetchCollections());
    dispatch(collapseAllTreeFolders());
    dispatch(closeScanner());
  };

  const handleClose = () => {
    dispatch(closeScanner());
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5" />
            Scan Backend Project
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {step === "select" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a backend project folder. The scanner will detect the language,
              framework, and API routes automatically.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Project folder</label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  placeholder="No folder selected"
                  value={projectPath ?? ""}
                  className="font-mono text-xs"
                />
                <Button variant="outline" onClick={handlePickFolder}>
                  <FolderSearch className="h-4 w-4" />
                  Browse
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Collection name</label>
              <Input
                value={collectionName}
                onChange={(e) => dispatch(setCollectionName(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Base URL</label>
              <Input
                value={baseUrl}
                onChange={(e) => dispatch(setBaseUrl(e.target.value))}
                placeholder="http://localhost:3000"
              />
            </div>
          </div>
        )}

        {step === "scanning" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">{progress?.message ?? "Scanning..."}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {progress?.percent ?? 0}% complete
                {progress?.routesFound != null && ` · ${progress.routesFound} routes found`}
              </p>
            </div>
            <div className="h-2 w-full max-w-xs rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {step === "preview" && result && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex shrink-0 flex-wrap gap-2">
              <Badge variant="secondary">Language: {result.language}</Badge>
              <Badge variant="secondary">Framework: {result.framework}</Badge>
              <Badge variant="outline">{totalCount} routes</Badge>
              <Badge variant="outline">{result.durationMs}ms</Badge>
            </div>

            {result.warnings.length > 0 && (
              <div className="max-h-20 shrink-0 overflow-y-auto rounded-md border px-3 py-2 text-sm">
                {result.warnings.map((w, i) => (
                  <div key={i} className="text-muted-foreground">
                    {w.severity}: {w.message}
                  </div>
                ))}
              </div>
            )}

            <div className="flex shrink-0 items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedCount} of {totalCount} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch(selectAllEndpoints())}
                >
                  Select all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch(deselectAllEndpoints())}
                >
                  Deselect all
                </Button>
              </div>
            </div>

            <div className="min-h-[200px] flex-1 overflow-y-auto rounded-md border">
              <div className="space-y-3 p-2 pb-4">
                {groupedEndpoints.map(([folder, endpoints]) => (
                  <div key={folder}>
                    <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {folder}
                    </div>
                    {endpoints.map((ep) => (
                      <label
                        key={ep.id}
                        className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedEndpointIds.includes(ep.id)}
                          onCheckedChange={() =>
                            dispatch(toggleEndpointSelection(ep.id))
                          }
                        />
                        <span
                          className={cn(
                            "w-14 shrink-0 text-center font-mono text-[10px] font-semibold",
                            getMethodClass(ep.method),
                          )}
                        >
                          {ep.method}
                        </span>
                        <span className="flex-1 truncate font-mono text-sm">
                          {ep.path}
                        </span>
                        <span className="max-w-[120px] truncate text-xs text-muted-foreground">
                          {ep.sourceFile}
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importing collection...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="font-medium">Import complete</p>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {step === "select" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleScan} disabled={!projectPath}>
                Scan project
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0}
              >
                Import {selectedCount} route{selectedCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {(step === "done" || step === "importing") && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
