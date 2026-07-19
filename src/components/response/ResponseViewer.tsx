import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { useResponseBodyView } from "@/hooks/useResponseBodyView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponseBodyViewer } from "@/components/response/ResponseBodyViewer";
import { ResponsePrettyToolbar } from "@/components/response/ResponsePrettyToolbar";
import { QuerySupportBadge } from "@/components/response/QuerySupportBadge";
import { TestResults } from "@/components/response/TestResults";
import { ResponseEmptyState } from "@/components/response/ResponseEmptyState";
import { formatBytes, formatDuration } from "@/utils/dateGroups";
import { BrandLoadingScreen } from "@/components/common/BrandLoadingScreen";
import {
  getScriptErrorFromPipeline,
  hasScriptsExecuted,
} from "@/script-engine/utils/script-errors";
import { type QueryFallbackMethod } from "@/http-methods";
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { sendRequestThunk } from "@/store/thunks/sendRequest";
import { cn } from "@/utils/cn";

interface ResponseViewerProps {
  tabId: string;
}

function getEditorTheme(theme: string): "vs-dark" | "light" {
  if (theme === "dark") return "vs-dark";
  if (theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "vs-dark"
    : "light";
}

function statusTone(status: number): string {
  if (status >= 200 && status < 300) return "text-emerald-500";
  if (status >= 400) return "text-destructive";
  if (status >= 300) return "text-amber-500";
  return "text-muted-foreground";
}

export function ResponseViewer({ tabId }: ResponseViewerProps) {
  const dispatch = useAppDispatch();
  const response = useAppSelector((s) => s.response.responses[tabId]);
  const loading = useAppSelector((s) => s.response.loading[tabId]);
  const draft = useAppSelector((s) => s.request.drafts[tabId]);
  const scriptState = useAppSelector((s) => s.scriptExecution.byTab[tabId]);
  const scriptError = getScriptErrorFromPipeline(scriptState?.pipeline);
  const theme = useAppSelector((s) => s.settings.theme);
  const editorTheme = getEditorTheme(theme);
  const [activeTab, setActiveTab] = useState("pretty");
  const lastTestCount = useRef(0);

  const bodyView = useResponseBodyView(
    response?.body ?? "",
    response?.headers ?? {},
  );
  const responseTabValue = [
    "pretty",
    "raw",
    "headers",
    "timeline",
    "tests",
  ].includes(activeTab)
    ? activeTab
    : "pretty";
  const testResults = scriptState?.testResults ?? [];
  const hasFailedTests = testResults.some((t) => t.status === "failed");
  const hasScriptsRun = hasScriptsExecuted(scriptState?.pipeline, {
    logCount: scriptState?.logs.length ?? 0,
    testCount: testResults.length,
  });
  const queryCapability = response?.query_support ?? null;
  const testCount = testResults.length;

  useEffect(() => {
    if (testCount > lastTestCount.current) {
      setActiveTab("tests");
    }
    lastTestCount.current = testCount;
  }, [testCount]);

  const handleQueryFallback = (fallback: QueryFallbackMethod) => {
    if (!draft) return;
    const changes =
      fallback === "GET"
        ? { method: "GET" as const, bodyType: "none" as const, body: "" }
        : { method: "POST" as const };
    dispatch(updateDraft({ tabId, changes }));
    dispatch(updateTab({ id: tabId, changes: { unsaved: true } }));
    queueMicrotask(() => {
      dispatch(sendRequestThunk(tabId));
    });
  };

  if (loading) {
    return (
      <BrandLoadingScreen
        fullScreen={false}
        message="Sending request"
        submessage="Waiting for response..."
        className="bg-background"
      />
    );
  }

  if (!response) {
    if (testCount > 0) {
      return (
        <div className="flex h-full flex-col">
          <div className="flex h-7 items-center border-b border-border/50 px-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Tests
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <TestResults results={testResults} />
          </div>
        </div>
      );
    }
    return <ResponseEmptyState />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Status strip */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border/50 px-3 py-1.5">
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            statusTone(response.status),
          )}
        >
          {response.status} {response.status_text}
        </span>
        <MetaSep />
        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
          <Clock3 className="h-3 w-3 opacity-70" />
          {formatDuration(response.duration_ms)}
        </span>
        <MetaSep />
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatBytes(response.size_bytes)}
        </span>
        {response.request_method && (
          <>
            <MetaSep />
            <span
              className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/80"
              title="HTTP method placed on the wire"
            >
              {response.request_method}
            </span>
          </>
        )}
        {draft && (
          <QuerySupportBadge
            method={draft.method}
            response={response}
            capability={
              queryCapability ??
              (draft.method === "QUERY" &&
              (response.status === 405 || response.status === 501)
                ? {
                    host: "",
                    status: "rejected" as const,
                    allowedMethods: [],
                    acceptQueryMediaTypes: [],
                    updatedAt: Date.now(),
                    lastStatusCode: response.status,
                  }
                : null)
            }
            onRetryAs={handleQueryFallback}
          />
        )}

        <div className="ml-auto flex items-center">
          {scriptState?.running ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3 animate-pulse" />
              Scripts
            </span>
          ) : scriptError ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
              <XCircle className="h-3 w-3" />
              Script failed
            </span>
          ) : hasScriptsRun ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                hasFailedTests ? "text-amber-500" : "text-emerald-500",
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              {hasFailedTests
                ? "Tests failed"
                : testCount > 0
                  ? `${testCount} passed`
                  : "Scripts ok"}
            </span>
          ) : null}
        </div>
      </div>

      {(response.error || scriptError) && (
        <div className="flex items-start gap-1.5 border-b border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="min-w-0">
            {response.error && (
              <div className="wrap-break-word">{response.error}</div>
            )}
            {scriptError && (
              <div className="wrap-break-word">
                Script ({scriptError.phase}): {scriptError.error.message}
              </div>
            )}
          </div>
        </div>
      )}
      {draft?.method === "QUERY" &&
        (response.status === 405 || response.status === 501) && (
          <div className="border-b border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
            This server may not support HTTP QUERY. Retry as POST or GET.
          </div>
        )}

      <Tabs
        value={responseTabValue}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/50 px-2">
          <TabsList className="h-7 gap-0.5 rounded-md bg-transparent p-0">
            {(
              [
                ["pretty", "Pretty"],
                ["raw", "Raw"],
                ["headers", "Headers"],
                ["timeline", "Timing"],
                ["tests", "Tests"],
              ] as const
            ).map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-5 rounded-md px-2.5 text-[11px] shadow-none data-[state=active]:bg-accent data-[state=active]:shadow-none "
              >
                {label}
                {value === "tests" && testCount > 0 ? (
                  <span
                    className={cn(
                      "ml-1 tabular-nums",
                      hasFailedTests ? "text-amber-500" : "text-muted-foreground",
                    )}
                  >
                    {testCount}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {activeTab === "pretty" && (
            <div className="ml-auto min-w-0">
              <ResponsePrettyToolbar view={bodyView} />
            </div>
          )}
        </div>

        <TabsContent
          value="pretty"
          className="mt-0 min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden"
        >
          <ResponseBodyViewer
            body={response.body}
            editorTheme={editorTheme}
            view={bodyView}
          />
        </TabsContent>

        <TabsContent
          value="raw"
          className="mt-0 min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden"
        >
          <pre className="h-full overflow-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90">
            {response.body || "(empty body)"}
          </pre>
        </TabsContent>

        <TabsContent
          value="headers"
          className="mt-0 min-h-0 flex-1 overflow-auto p-0 data-[state=inactive]:hidden"
        >
          {Object.keys(response.headers).length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-muted-foreground">
              No headers
            </div>
          ) : (
            <table className="w-full text-[11px]">
              <tbody>
                {Object.entries(response.headers).map(([key, value]) => (
                  <tr
                    key={key}
                    className="border-b border-border/40 align-top hover:bg-muted/20"
                  >
                    <td className="w-[28%] max-w-48 truncate px-3 py-1.5 font-medium text-foreground/90">
                      {key}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground break-all">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent
          value="timeline"
          className="mt-0 min-h-0 flex-1 overflow-auto px-1 py-1 data-[state=inactive]:hidden"
        >
          <div className="divide-y divide-border/40">
            <TimelineRow label="Total" value={response.timing.total_ms} />
            <TimelineRow label="TTFB" value={response.timing.ttfb_ms} />
            <TimelineRow label="Connect" value={response.timing.connect_ms} />
            <TimelineRow label="DNS" value={response.timing.dns_ms} />
            {scriptState?.pipeline?.timeline.map((entry) => (
              <TimelineRow
                key={entry.stage}
                label={entry.stage}
                value={entry.durationMs}
                success={entry.success}
                error={entry.error}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent
          value="tests"
          className="mt-0 min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden"
        >
          <TestResults results={testResults} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetaSep() {
  return (
    <span className="text-[10px] text-border select-none" aria-hidden>
      ·
    </span>
  );
}

function TimelineRow({
  label,
  value,
  success,
  error,
}: {
  label: string;
  value: number | null;
  success?: boolean;
  error?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-medium capitalize text-foreground/90">
          {label}
        </div>
        {error && (
          <div className="truncate text-[10px] text-destructive">{error}</div>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 text-[11px] tabular-nums",
          success === false ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {value != null ? `${Math.round(value)} ms` : "—"}
      </span>
    </div>
  );
}
