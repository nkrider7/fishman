import { useState } from "react";
import { useAppSelector } from "@/hooks/redux";
import { useResponseBodyView } from "@/hooks/useResponseBodyView";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponseBodyViewer } from "@/components/response/ResponseBodyViewer";
import { ResponsePrettyToolbar } from "@/components/response/ResponsePrettyToolbar";
import { formatBytes, formatDuration } from "@/utils/dateGroups";
import { BrandLoadingScreen } from "@/components/common/BrandLoadingScreen";

interface ResponseViewerProps {
  tabId: string;
}

function getStatusVariant(status: number) {
  if (status >= 200 && status < 300) return "success" as const;
  if (status >= 400) return "error" as const;
  if (status >= 300) return "warning" as const;
  return "secondary" as const;
}

function getEditorTheme(theme: string): "vs-dark" | "light" {
  if (theme === "dark") return "vs-dark";
  if (theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "vs-dark"
    : "light";
}

export function ResponseViewer({ tabId }: ResponseViewerProps) {
  const response = useAppSelector((s) => s.response.responses[tabId]);
  const loading = useAppSelector((s) => s.response.loading[tabId]);
  const theme = useAppSelector((s) => s.settings.theme);
  const editorTheme = getEditorTheme(theme);
  const [activeTab, setActiveTab] = useState("pretty");

  const bodyView = useResponseBodyView(
    response?.body ?? "",
    response?.headers ?? {},
  );

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
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Send a request to see the response
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Badge variant={getStatusVariant(response.status)}>
          {response.status} {response.status_text}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {formatDuration(response.duration_ms)}
        </span>
        <span className="text-sm text-muted-foreground">
          {formatBytes(response.size_bytes)}
        </span>
        {response.error && (
          <span className="text-sm text-destructive">{response.error}</span>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2">
          <TabsList className="h-8">
            <TabsTrigger value="pretty" className="text-xs">
              Pretty
            </TabsTrigger>
            <TabsTrigger value="raw" className="text-xs">
              Raw
            </TabsTrigger>
            <TabsTrigger value="headers" className="text-xs">
              Headers
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs">
              Timeline
            </TabsTrigger>
          </TabsList>

          {activeTab === "pretty" && <ResponsePrettyToolbar view={bodyView} />}
        </div>

        <TabsContent
          value="pretty"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3"
        >
          <ResponseBodyViewer
            body={response.body}
            editorTheme={editorTheme}
            view={bodyView}
          />
        </TabsContent>

        <TabsContent
          value="raw"
          className="mt-0 flex-1 overflow-hidden px-4 py-3"
        >
          <div className="h-full overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-sm whitespace-pre-wrap">
            {response.body || "(empty body)"}
          </div>
        </TabsContent>

        <TabsContent
          value="headers"
          className="mt-0 flex-1 overflow-auto px-4 py-3"
        >
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(response.headers).map(([key, value]) => (
                <tr key={key} className="border-b">
                  <td className="py-2 pr-4 font-medium">{key}</td>
                  <td className="py-2 text-muted-foreground">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent
          value="timeline"
          className="mt-0 flex-1 overflow-auto px-4 py-3"
        >
          <div className="space-y-3">
            <TimelineRow label="Total" value={response.timing.total_ms} />
            <TimelineRow label="TTFB" value={response.timing.ttfb_ms} />
            <TimelineRow label="Connect" value={response.timing.connect_ms} />
            <TimelineRow label="DNS" value={response.timing.dns_ms} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TimelineRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-sm text-muted-foreground">
        {value != null ? `${value} ms` : "—"}
      </span>
    </div>
  );
}
