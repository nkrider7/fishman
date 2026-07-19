import { ScriptOutputPanel } from "@/components/request/ScriptOutputPanel";

interface ConsoleTabProps {
  tabId: string | null;
}

export function ConsoleTab({ tabId }: ConsoleTabProps) {
  if (!tabId) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">
        Open a request tab to view script console output.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <ScriptOutputPanel tabId={tabId} />
    </div>
  );
}
