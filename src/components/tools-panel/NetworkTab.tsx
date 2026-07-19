import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { clearNetworkLog } from "@/store/slices/networkLogSlice";
import { NetworkTable } from "./NetworkTable";

export function NetworkTab() {
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.networkLog.entries);
  const selectedId = useAppSelector((s) => s.networkLog.selectedId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2">
        <span className="text-[11px] text-muted-foreground">
          {entries.length === 0
            ? "No requests this session"
            : `${entries.length} request${entries.length === 1 ? "" : "s"}`}
        </span>
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
      <div className="min-h-0 flex-1 overflow-auto">
        <NetworkTable entries={entries} selectedId={selectedId} />
      </div>
    </div>
  );
}
