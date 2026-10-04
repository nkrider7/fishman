import { useEffect, useMemo, useState } from "react";
import { Filter, Trash2 } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  clearNetworkLog,
  selectNetworkLogEntry,
} from "@/store/slices/networkLogSlice";
import { NetworkTable } from "./NetworkTable";
import { NetworkDetailPanel } from "./network/NetworkDetailPanel";
import {
  filterNetworkEntries,
  type NetworkEntryFilter,
} from "./network/filterEntries";

export function NetworkTab() {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.networkLog.entries);
  const selectedId = useAppSelector((s) => s.networkLog.selectedId);
  const [filter, setFilter] = useState<NetworkEntryFilter>("all");

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "fishman-network-panel",
    panelIds: ["network-list", "network-detail"],
    storage: localStorage,
  });

  const filteredEntries = useMemo(
    () => filterNetworkEntries(entries, filter),
    [entries, filter],
  );

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  useEffect(() => {
    if (selectedId && !entries.some((entry) => entry.id === selectedId)) {
      dispatch(selectNetworkLogEntry(null));
    }
  }, [dispatch, entries, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !selectedId) return;
      dispatch(selectNetworkLogEntry(null));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, selectedId]);

  const toolbar = (
    <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
      <span className="text-[11px] text-muted-foreground">
        {entries.length === 0
          ? "No requests this session"
          : filter === "all"
            ? `${entries.length} request${entries.length === 1 ? "" : "s"}`
            : `${filteredEntries.length} of ${entries.length} requests`}
      </span>
      <div className="flex items-center gap-1">
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as NetworkEntryFilter)}
        >
          <SelectTrigger className="h-6 w-[88px] gap-1 border-border/50 bg-transparent px-2 text-[11px] shadow-none">
            <Filter className="h-3 w-3 shrink-0 opacity-60" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all" className="text-xs">
              All
            </SelectItem>
            <SelectItem value="2xx" className="text-xs">
              2xx
            </SelectItem>
            <SelectItem value="3xx" className="text-xs">
              3xx
            </SelectItem>
            <SelectItem value="4xx" className="text-xs">
              4xx
            </SelectItem>
            <SelectItem value="5xx" className="text-xs">
              5xx
            </SelectItem>
            <SelectItem value="errors" className="text-xs">
              Errors
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          disabled={entries.length === 0}
          title="Clear network log"
          onClick={() => dispatch(clearNetworkLog())}
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>
    </div>
  );

  if (!selectedEntry) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {toolbar}
        <div className="min-h-0 flex-1 overflow-auto">
          <NetworkTable entries={filteredEntries} selectedId={selectedId} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      <Group
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <Panel id="network-list" defaultSize={55} minSize={30} className="min-h-0 min-w-0">
          <div className="h-full overflow-auto">
            <NetworkTable entries={filteredEntries} selectedId={selectedId} />
          </div>
        </Panel>
        <Separator className="w-px bg-border transition-colors hover:bg-primary/50 data-[separator=active]:bg-primary/50" />
        <Panel id="network-detail" defaultSize={45} minSize={25} className="min-h-0 min-w-0">
          <NetworkDetailPanel entry={selectedEntry} />
        </Panel>
      </Group>
    </div>
  );
}
