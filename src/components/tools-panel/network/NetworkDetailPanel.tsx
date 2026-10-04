import { useEffect, useState } from "react";
import { ArrowRight, FileText, Network, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppDispatch } from "@/hooks/redux";
import {
  selectNetworkLogEntry,
  type NetworkLogEntry,
} from "@/store/slices/networkLogSlice";
import { NetworkRequestPane } from "./NetworkRequestPane";
import { NetworkResponsePane } from "./NetworkResponsePane";
import { NetworkTracePane } from "./NetworkTracePane";

interface NetworkDetailPanelProps {
  entry: NetworkLogEntry;
}

type DetailTab = "request" | "response" | "network";

function defaultTab(entry: NetworkLogEntry): DetailTab {
  if (entry.error || entry.statusCode == null || entry.statusCode === 0) {
    return "network";
  }
  return "response";
}

function formatDetailTimestamp(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleString();
  } catch {
    return "—";
  }
}

export function NetworkDetailPanel({ entry }: NetworkDetailPanelProps) {
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState<DetailTab>(() => defaultTab(entry));

  useEffect(() => {
    setActiveTab(defaultTab(entry));
  }, [entry.id]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col border-l border-border/60 bg-background">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-[11px] font-medium text-foreground">
            Request Details ({formatDetailTimestamp(entry.startedAt)})
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="Close details"
          onClick={() => dispatch(selectNetworkLogEntry(null))}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as DetailTab)}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsList className="h-8 w-full shrink-0 justify-start rounded-none border-b border-border/60 bg-transparent px-1">
          <TabsTrigger
            value="request"
            className="h-7 gap-1 px-2 text-[11px] data-[state=active]:bg-muted/60"
          >
            <ArrowRight className="h-3 w-3" />
            Request
          </TabsTrigger>
          <TabsTrigger
            value="response"
            className="h-7 gap-1 px-2 text-[11px] data-[state=active]:bg-muted/60"
          >
            <FileText className="h-3 w-3" />
            Response
          </TabsTrigger>
          <TabsTrigger
            value="network"
            className="h-7 gap-1 px-2 text-[11px] data-[state=active]:bg-muted/60"
          >
            <Network className="h-3 w-3" />
            Network
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="request"
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <NetworkRequestPane entry={entry} />
        </TabsContent>
        <TabsContent
          value="response"
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <NetworkResponsePane entry={entry} />
        </TabsContent>
        <TabsContent
          value="network"
          className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <NetworkTracePane entry={entry} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
