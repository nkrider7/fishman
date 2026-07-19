import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TerminalTab() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-40 shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="flex h-7 items-center justify-between border-b border-border/60 px-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            Sessions
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            disabled
            title="Coming soon"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex flex-1 items-start justify-center p-3">
          <p className="text-center text-[11px] text-muted-foreground">
            No sessions yet.
            <br />
            <span className="text-[10px]">Coming soon</span>
          </p>
        </div>
      </aside>
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-xs text-muted-foreground">
          No terminal session selected
        </p>
      </div>
    </div>
  );
}
