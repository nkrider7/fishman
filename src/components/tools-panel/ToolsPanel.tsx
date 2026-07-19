import {
  Activity,
  Network,
  SquareTerminal,
  Terminal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  setScriptConsoleVisible,
  setToolsPanelTab,
  type ToolsPanelTab,
} from "@/store/slices/uiSlice";
import { getScriptErrorFromPipeline } from "@/script-engine/utils/script-errors";
import { cn } from "@/utils/cn";
import { ConsoleTab } from "./ConsoleTab";
import { NetworkTab } from "./NetworkTab";
import { PerformanceTab } from "./PerformanceTab";
import { TerminalTab } from "./TerminalTab";

const TABS: {
  id: ToolsPanelTab;
  label: string;
  icon: typeof Terminal;
}[] = [
  { id: "console", label: "Console", icon: Terminal },
  { id: "network", label: "Network", icon: Network },
  { id: "performance", label: "Performance", icon: Activity },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
];

interface ToolsPanelProps {
  tabId: string | null;
}

export function ToolsPanel({ tabId }: ToolsPanelProps) {
  const dispatch = useAppDispatch();
  const activeTab = useAppSelector((s) => s.ui.toolsPanelTab);
  const panelVisible = useAppSelector((s) => s.ui.scriptConsoleVisible);
  const scriptError = useAppSelector((s) =>
    tabId
      ? getScriptErrorFromPipeline(s.scriptExecution.byTab[tabId]?.pipeline)
      : null,
  );

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-border bg-background">
      <div
        className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-1"
        role="tablist"
        aria-label="Tools panel"
      >
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => {
            const selected = activeTab === id;
            const showErrorBadge = id === "console" && !!scriptError;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`tools-tab-${id}`}
                className={cn(
                  "relative flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-xs transition-colors",
                  selected
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => dispatch(setToolsPanelTab(id))}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                {showErrorBadge && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-destructive"
                    title="Script error"
                  />
                )}
                {selected && (
                  <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="Close tools panel"
          onClick={() => dispatch(setScriptConsoleVisible(false))}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        className="min-h-0 flex-1"
        role="tabpanel"
        aria-labelledby={`tools-tab-${activeTab}`}
      >
        {activeTab === "console" && <ConsoleTab tabId={tabId} />}
        {activeTab === "network" && <NetworkTab />}
        {activeTab === "performance" && (
          <PerformanceTab active={panelVisible && activeTab === "performance"} />
        )}
        {activeTab === "terminal" && <TerminalTab />}
      </div>
    </div>
  );
}
