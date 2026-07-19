import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseGraphQLResponseBody } from "@/graphql";
import { cn } from "@/utils/cn";

interface GraphQLResponsePanelProps {
  body: string;
  editorTheme: "vs-dark" | "light";
  /** When true, treat as GraphQL even if shape is ambiguous. */
  forceGraphQL?: boolean;
}

export function GraphQLResponsePanel({
  body,
  editorTheme,
  forceGraphQL = false,
}: GraphQLResponsePanelProps) {
  const parts = useMemo(() => parseGraphQLResponseBody(body), [body]);
  const [tab, setTab] = useState("data");

  if (!parts.isGraphQLShaped && !forceGraphQL) {
    return null;
  }

  const active =
    tab === "errors" && !parts.hasErrors
      ? "data"
      : tab === "extensions" && !parts.hasExtensions
        ? "data"
        : tab;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {parts.hasErrors ? (
        <div className="flex items-center gap-1.5 border-b border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          GraphQL returned errors (HTTP may still be 200)
        </div>
      ) : null}
      <Tabs
        value={active}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-2 mt-2 h-8 w-fit">
          <TabsTrigger value="data" className="text-xs">
            Data
          </TabsTrigger>
          <TabsTrigger
            value="errors"
            className={cn(
              "text-xs",
              parts.hasErrors && "text-destructive data-[state=active]:text-destructive",
            )}
            disabled={!parts.hasErrors && parts.errors === undefined}
          >
            Errors
            {parts.hasErrors ? " !" : ""}
          </TabsTrigger>
          {parts.hasExtensions ? (
            <TabsTrigger value="extensions" className="text-xs">
              Extensions
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="data" className="mt-0 min-h-0 flex-1">
          <Editor
            height="100%"
            language="json"
            theme={editorTheme}
            value={parts.dataJson || "null"}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </TabsContent>
        <TabsContent value="errors" className="mt-0 min-h-0 flex-1">
          <Editor
            height="100%"
            language="json"
            theme={editorTheme}
            value={parts.errorsJson || "[]"}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </TabsContent>
        {parts.hasExtensions ? (
          <TabsContent value="extensions" className="mt-0 min-h-0 flex-1">
            <Editor
              height="100%"
              language="json"
              theme={editorTheme}
              value={parts.extensionsJson}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

export function isGraphQLResponse(body: string): boolean {
  return parseGraphQLResponseBody(body).isGraphQLShaped;
}
