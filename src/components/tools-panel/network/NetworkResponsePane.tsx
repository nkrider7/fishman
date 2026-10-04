import { useState } from "react";
import { Eye } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAppSelector } from "@/hooks/redux";
import { useResponseBodyView } from "@/hooks/useResponseBodyView";
import type { NetworkLogEntry } from "@/store/slices/networkLogSlice";
import { ResponseBodyViewer } from "@/components/response/ResponseBodyViewer";
import { RESPONSE_FORMAT_OPTIONS } from "@/utils/responseFormat";
import { HeadersTable } from "./HeadersTable";
import { NetworkSectionHeader } from "./NetworkSectionHeader";

interface NetworkResponsePaneProps {
  entry: NetworkLogEntry;
}

type HeadersView = "table" | "raw";
type BodyView = "pretty" | "raw";

function getEditorTheme(theme: string): "vs-dark" | "light" {
  if (theme === "dark") return "vs-dark";
  if (theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "vs-dark"
    : "light";
}

function formatHeadersRaw(headers: Record<string, string>): string {
  const entries = Object.entries(headers);
  if (!entries.length) return "";
  return entries.map(([key, value]) => `${key}: ${value}`).join("\n");
}

export function NetworkResponsePane({ entry }: NetworkResponsePaneProps) {
  const theme = useAppSelector((s) => s.settings.theme);
  const editorTheme = getEditorTheme(theme);
  const headers = entry.responseHeaders ?? {};
  const body = entry.responseBody ?? "";
  const bodyView = useResponseBodyView(body, headers);
  const [headersView, setHeadersView] = useState<HeadersView>("table");
  const [bodyDisplay, setBodyDisplay] = useState<BodyView>("pretty");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <section className="flex shrink-0 flex-col border-b border-border/60">
        <NetworkSectionHeader title="Response Headers">
          <Select
            value={headersView}
            onValueChange={(value) => setHeadersView(value as HeadersView)}
          >
            <SelectTrigger className="h-6 w-[88px] border-border/50 bg-background/70 px-2 text-[11px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="table" className="text-xs">
                Table
              </SelectItem>
              <SelectItem value="raw" className="text-xs">
                Raw
              </SelectItem>
            </SelectContent>
          </Select>
        </NetworkSectionHeader>
        <div className="max-h-40 overflow-auto">
          {headersView === "table" ? (
            <HeadersTable
              headers={headers}
              emptyMessage="No response headers captured"
            />
          ) : (
            <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {formatHeadersRaw(headers) || "No response headers captured"}
            </pre>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <NetworkSectionHeader title="Response Body">
          <Select
            value={bodyDisplay}
            onValueChange={(value) => setBodyDisplay(value as BodyView)}
          >
            <SelectTrigger className="h-6 w-[88px] border-border/50 bg-background/70 px-2 text-[11px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="pretty" className="text-xs">
                Pretty
              </SelectItem>
              <SelectItem value="raw" className="text-xs">
                Raw
              </SelectItem>
            </SelectContent>
          </Select>
          {bodyDisplay === "pretty" ? (
            <>
              <Select
                value={bodyView.format}
                onValueChange={bodyView.handleFormatChange}
              >
                <SelectTrigger className="h-6 w-[92px] border-border/50 bg-background/70 px-2 text-[11px] shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {RESPONSE_FORMAT_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bodyView.isHtml ? (
                <label
                  htmlFor={`network-html-preview-${entry.id}`}
                  className="flex h-6 cursor-pointer items-center gap-1 rounded border border-border/50 bg-background/70 px-1.5 text-[10px] text-muted-foreground"
                >
                  <Eye className="h-3 w-3" />
                  Preview
                  <Switch
                    id={`network-html-preview-${entry.id}`}
                    checked={bodyView.previewEnabled}
                    onCheckedChange={bodyView.setPreviewEnabled}
                    className="scale-75 data-[state=checked]:bg-amber-600"
                  />
                </label>
              ) : null}
            </>
          ) : null}
        </NetworkSectionHeader>

        {entry.responseBodyTruncated ? (
          <p className="shrink-0 border-b border-border/40 px-3 py-1 text-[10px] text-amber-600 dark:text-amber-400">
            Body truncated for network log storage.
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          {!body ? (
            <div className="px-3 py-4 text-[11px] text-muted-foreground">
              (empty body)
            </div>
          ) : bodyDisplay === "raw" ? (
            <pre className="h-full overflow-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/90">
              {body}
            </pre>
          ) : (
            <ResponseBodyViewer
              body={body}
              editorTheme={editorTheme}
              view={bodyView}
            />
          )}
        </div>
      </section>
    </div>
  );
}
