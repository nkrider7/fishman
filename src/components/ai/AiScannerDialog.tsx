import { useState, useMemo } from "react";
import {
  Sparkles,
  FolderSearch,
  CheckCircle2,
  AlertCircle,
  Folder,
  Lock,
  Copy,
  Check,
  Search,
  RefreshCw,
  Cpu,
  Layers,
  FileCode2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  closeAiScanner,
  pickAiScanFolder,
  runAiCodebaseScan,
  importAiScanEndpoints,
  setAiScannerCollectionName,
  setAiScannerBaseUrl,
  setAiScannerGenerateMocks,
  setAiScannerDetectAuth,
  setAiScannerCreateEnvironment,
  toggleEndpointSelection,
  selectAllEndpoints,
  deselectAllEndpoints,
  setActiveMethodFilter,
  setSearchQuery,
  setSelectedPreviewEndpointId,
  setAiScannerStep,
} from "@/store/slices/aiScannerSlice";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";
import type { HttpMethod } from "@/types/request";

export function AiScannerDialog() {
  const open = useAppSelector((state) => state.aiScanner.open);
  if (!open) return null;
  return <AiScannerDialogContent />;
}

function AiScannerDialogContent() {
  const dispatch = useAppDispatch();
  const {
    step,
    projectPath,
    collectionName,
    baseUrl,
    generateMocks,
    detectAuth,
    createEnvironment,
    progress,
    summary,
    endpoints,
    selectedEndpointIds,
    activeMethodFilter,
    searchQuery,
    selectedPreviewEndpointId,
    error,
  } = useAppSelector((state) => state.aiScanner);

  const [copiedMock, setCopiedMock] = useState(false);

  // Filtered endpoints based on method pill and search text
  const filteredEndpoints = useMemo(() => {
    return endpoints.filter((ep) => {
      const matchesMethod =
        activeMethodFilter === "ALL" || ep.method.toUpperCase() === activeMethodFilter;
      const matchesQuery =
        !searchQuery ||
        ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ep.sourceFile.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesMethod && matchesQuery;
    });
  }, [endpoints, activeMethodFilter, searchQuery]);

  // Group filtered endpoints by folder
  const groupedEndpoints = useMemo(() => {
    const groups = new Map<string, typeof filteredEndpoints>();
    for (const ep of filteredEndpoints) {
      const folderKey = ep.folder.length > 0 ? ep.folder.join(" / ") : "General";
      const list = groups.get(folderKey) ?? [];
      list.push(ep);
      groups.set(folderKey, list);
    }
    return Array.from(groups.entries());
  }, [filteredEndpoints]);

  // Previewed endpoint
  const previewEndpoint = useMemo(() => {
    if (!selectedPreviewEndpointId) return endpoints[0] ?? null;
    return endpoints.find((e) => e.id === selectedPreviewEndpointId) ?? endpoints[0] ?? null;
  }, [endpoints, selectedPreviewEndpointId]);

  const handlePickFolder = () => {
    dispatch(pickAiScanFolder());
  };

  const handleStartScan = () => {
    if (!projectPath) return;
    dispatch(
      runAiCodebaseScan({
        projectPath,
        baseUrl,
        generateMocks,
        detectAuth,
      }),
    );
  };

  const handleImport = () => {
    dispatch(importAiScanEndpoints());
  };

  const handleClose = () => {
    dispatch(closeAiScanner());
  };

  const handleCopyMock = (body: string) => {
    navigator.clipboard.writeText(body);
    setCopiedMock(true);
    setTimeout(() => setCopiedMock(false), 2000);
  };

  const methodOptions = ["ALL", "GET", "POST", "PUT", "DELETE", "PATCH"];

  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="flex max-h-[min(90vh,880px)] w-full max-w-4xl flex-col overflow-hidden p-0 gap-0 border-border/80 shadow-2xl bg-background">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border/70 px-6 py-4 bg-muted/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 to-primary/20 text-primary border border-primary/20 shadow-xs">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                AI Backend Codebase Scanner
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary border border-primary/20">
                  <Zap className="h-2.5 w-2.5" />
                  Needle 2
                </span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                100% Offline & Private · Zero Telemetry · Local AST & Schema Synthesizer
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-2.5 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-xs text-destructive shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Select & Configure */}
        {step === "select" && (
          <div className="flex flex-col gap-6 p-6 overflow-y-auto">
            {/* Project Folder Picker */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-foreground">
                Backend Project Directory
              </label>
              <div
                onClick={handlePickFolder}
                className={cn(
                  "group flex cursor-pointer items-center justify-between rounded-lg border border-dashed p-4 transition-all hover:border-primary/60 hover:bg-primary/5",
                  projectPath
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/80 bg-muted/10",
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background border border-border group-hover:border-primary/30 group-hover:text-primary transition-colors">
                    {projectPath ? (
                      <Folder className="h-5 w-5 text-primary" />
                    ) : (
                      <FolderSearch className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {projectPath ? (
                      <div>
                        <span className="font-mono text-xs font-medium text-foreground truncate block">
                          {projectPath}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Click to choose a different folder
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-sm font-medium text-foreground block">
                          Choose backend project folder
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Supports FastAPI, Express, NestJS, Spring Boot, Go (Gin/Chi), Axum
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 text-xs font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePickFolder();
                  }}
                >
                  Browse…
                </Button>
              </div>
            </div>

            {/* Target Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">
                  Collection Name
                </label>
                <Input
                  value={collectionName}
                  onChange={(e) => dispatch(setAiScannerCollectionName(e.target.value))}
                  placeholder="e.g. My API Backend"
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">
                    Default Base URL
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => dispatch(setAiScannerBaseUrl("http://localhost:3000"))}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded transition-colors",
                        baseUrl === "http://localhost:3000"
                          ? "bg-primary/20 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60 bg-muted/30",
                      )}
                    >
                      localhost:3000
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch(setAiScannerBaseUrl("{{baseurl}}"))}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors",
                        baseUrl === "{{baseurl}}"
                          ? "bg-primary/20 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60 bg-muted/30",
                      )}
                    >
                      {"{{baseurl}}"}
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch(setAiScannerBaseUrl("{{base_url}}"))}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors",
                        baseUrl === "{{base_url}}"
                          ? "bg-primary/20 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60 bg-muted/30",
                      )}
                    >
                      {"{{base_url}}"}
                    </button>
                  </div>
                </div>
                <Input
                  value={baseUrl}
                  onChange={(e) => dispatch(setAiScannerBaseUrl(e.target.value))}
                  placeholder="http://localhost:3000 or {{baseurl}}"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* AI Synthesizer Options */}
            <div className="rounded-lg border border-border/80 bg-muted/20 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                <Cpu className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  Needle 2 AI Synthesis Options
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <div className="text-xs font-medium text-foreground">
                    Generate Realistic Mock JSON Payloads
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Analyzes DTOs, Pydantic models, and interfaces to generate realistic request bodies
                  </div>
                </div>
                <Switch
                  checked={generateMocks}
                  onCheckedChange={(val) => dispatch(setAiScannerGenerateMocks(val))}
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <div className="text-xs font-medium text-foreground">
                    Auto-Detect Authentication & Security Schemes
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Detects JWT Bearer tokens, Basic Auth, and API Key middleware
                  </div>
                </div>
                <Switch
                  checked={detectAuth}
                  onCheckedChange={(val) => dispatch(setAiScannerDetectAuth(val))}
                />
              </div>

              <div className="flex items-center justify-between py-1">
                <div>
                  <div className="text-xs font-medium text-foreground">
                    Create Collection Environment
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Automatically sets up local environment variable {"{{base_url}}"}
                  </div>
                </div>
                <Switch
                  checked={createEnvironment}
                  onCheckedChange={(val) => dispatch(setAiScannerCreateEnvironment(val))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Scanning / Processing */}
        {step === "scanning" && (
          <div className="flex flex-col items-center justify-center p-12 gap-6 min-h-[380px]">
            {/* Animated Radar Effect */}
            <div className="relative flex items-center justify-center h-24 w-24">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
              <div className="absolute inset-2 rounded-full border border-primary/40 animate-spin" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/40 shadow-lg">
                <Sparkles className="h-7 w-7 animate-pulse" />
              </div>
            </div>

            <div className="text-center max-w-md">
              <h3 className="text-sm font-semibold text-foreground">
                Analyzing Codebase & Synthesizing Endpoints
              </h3>
              <p className="text-xs font-mono text-muted-foreground mt-1 truncate max-w-md">
                {progress?.currentFile || "Traversing source files..."}
              </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-border/80 bg-muted/20">
                <span className="text-lg font-bold text-foreground">
                  {progress?.filesScanned ?? 0}
                </span>
                <span className="text-[11px] text-muted-foreground">Files Scanned</span>
              </div>
              <div className="flex flex-col items-center justify-center p-3 rounded-lg border border-border/80 bg-muted/20">
                <span className="text-lg font-bold text-primary">
                  {progress?.endpointsFound ?? 0}
                </span>
                <span className="text-[11px] text-muted-foreground">Endpoints Found</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review & Payload Inspector */}
        {step === "review" && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Summary Statistics Bar */}
            <div className="flex items-center justify-between border-b border-border/70 px-6 py-2.5 bg-muted/10 shrink-0">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="font-medium text-xs bg-primary/5 border-primary/30 text-primary">
                  {summary?.frameworkDetected || "Detected Framework"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Discovered <strong className="text-foreground">{endpoints.length}</strong> routes across{" "}
                  <strong className="text-foreground">{summary?.filesScanned ?? 0}</strong> files in{" "}
                  <strong className="text-foreground">{((summary?.durationMs ?? 0) / 1000).toFixed(2)}s</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => dispatch(selectAllEndpoints())}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => dispatch(deselectAllEndpoints())}
                >
                  Deselect All
                </Button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-6 py-2 bg-background shrink-0">
              <div className="flex items-center gap-1">
                {methodOptions.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => dispatch(setActiveMethodFilter(m))}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors",
                      activeMethodFilter === m
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => dispatch(setSearchQuery(e.target.value))}
                  placeholder="Filter by route path or name…"
                  className="h-7 pl-8 text-xs"
                />
              </div>
            </div>

            {/* Split Review Pane: Left list, Right inspector */}
            <div className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0 overflow-hidden">
              {/* Left Column: Endpoints List */}
              <div className="md:col-span-7 border-r border-border/70 overflow-hidden flex flex-col">
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-4">
                    {groupedEndpoints.map(([folder, folderEndpoints]) => (
                      <div key={folder} className="space-y-1">
                        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <Layers className="h-3 w-3" />
                          <span>{folder}</span>
                          <span className="text-[10px] text-muted-foreground/70">
                            ({folderEndpoints.length})
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {folderEndpoints.map((ep) => {
                            const isSelected = selectedEndpointIds.includes(ep.id);
                            const isPreviewed = previewEndpoint?.id === ep.id;

                            return (
                              <div
                                key={ep.id}
                                onClick={() => dispatch(setSelectedPreviewEndpointId(ep.id))}
                                className={cn(
                                  "group flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors border border-transparent",
                                  isPreviewed
                                    ? "bg-primary/10 border-primary/30"
                                    : "hover:bg-muted/40",
                                )}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() =>
                                    dispatch(toggleEndpointSelection(ep.id))
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-3.5 w-3.5"
                                />
                                <span
                                  className={cn(
                                    "w-12 shrink-0 text-center font-mono text-[10px] font-bold",
                                    getMethodClass(ep.method as HttpMethod),
                                  )}
                                >
                                  {ep.method}
                                </span>
                                <span className="flex-1 font-mono text-xs text-foreground truncate">
                                  {ep.path}
                                </span>
                                {ep.requiresAuth && (
                                  <span title="Requires Authentication" className="flex items-center">
                                    <Lock className="h-3 w-3 shrink-0 text-amber-500/80" />
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Right Column: AI Inspector */}
              <div className="md:col-span-5 overflow-hidden flex flex-col bg-muted/10">
                {previewEndpoint ? (
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                      {/* Endpoint Header */}
                      <div className="space-y-1.5 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded font-mono text-xs font-bold",
                              getMethodClass(previewEndpoint.method as HttpMethod),
                            )}
                          >
                            {previewEndpoint.method}
                          </span>
                          <span className="font-semibold text-xs text-foreground">
                            {previewEndpoint.name}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground break-all bg-background/50 p-1.5 rounded border border-border/50">
                          {previewEndpoint.path}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                          <FileCode2 className="h-3 w-3" />
                          <span className="truncate">{previewEndpoint.sourceFile}</span>
                          {previewEndpoint.lineNumber && (
                            <span>:L{previewEndpoint.lineNumber}</span>
                          )}
                        </div>
                      </div>

                      {/* Auth Info */}
                      {previewEndpoint.requiresAuth && (
                        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                          <ShieldCheck className="h-4 w-4 shrink-0" />
                          <span>
                            Auth: {previewEndpoint.authType || "Bearer Token"} (Auto-injected)
                          </span>
                        </div>
                      )}

                      {/* Headers */}
                      {previewEndpoint.headers.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Headers ({previewEndpoint.headers.length})
                          </span>
                          <div className="space-y-1 bg-background/60 p-2 rounded-md border border-border/50 font-mono text-[11px]">
                            {previewEndpoint.headers.map((h) => (
                              <div key={h.key} className="flex justify-between gap-2">
                                <span className="text-muted-foreground">{h.key}:</span>
                                <span className="text-foreground truncate">{h.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mock JSON Body */}
                      {previewEndpoint.body ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-primary" />
                              AI Mock Body (Needle 2)
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => handleCopyMock(previewEndpoint.body)}
                            >
                              {copiedMock ? (
                                <>
                                  <Check className="h-3 w-3 mr-1 text-emerald-500" /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 mr-1" /> Copy JSON
                                </>
                              )}
                            </Button>
                          </div>
                          <pre className="rounded-md bg-muted/40 p-3 font-mono text-[11px] text-foreground overflow-x-auto border border-border/60 max-h-56">
                            <code>{previewEndpoint.body}</code>
                          </pre>
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed border-border/80 p-4 text-center text-xs text-muted-foreground">
                          No request body required for this route
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground h-full">
                    Select an endpoint to inspect AI-generated payloads
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center p-12 gap-3 min-h-[320px]">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Importing Collection & Writing Requests…
            </span>
            <span className="text-xs text-muted-foreground">
              Configuring routes, mock payloads, and environment variables
            </span>
          </div>
        )}

        {/* Step 5: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center p-12 gap-4 min-h-[320px] text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Import Complete!
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                Successfully imported{" "}
                <strong className="text-foreground">{selectedEndpointIds.length} endpoints</strong> into
                collection <strong className="text-foreground">{collectionName}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between border-t border-border/70 px-6 py-3 bg-muted/20 shrink-0">
          {step === "select" && (
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleStartScan}
                disabled={!projectPath}
                className="bg-primary text-primary-foreground gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Scan Codebase with AI
              </Button>
            </>
          )}

          {step === "review" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => dispatch(setAiScannerStep("select"))}
              >
                Back / Rescan
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={selectedEndpointIds.length === 0}
                className="bg-primary text-primary-foreground gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Import {selectedEndpointIds.length} Endpoints
              </Button>
            </>
          )}

          {step === "done" && (
            <div className="w-full flex justify-end">
              <Button size="sm" onClick={handleClose}>
                Done
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
