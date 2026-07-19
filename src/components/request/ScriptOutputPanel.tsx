import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { clearScriptExecution } from "@/store/slices/scriptExecutionSlice";
import { ScriptConsole } from "@/components/response/ScriptConsole";
import { getScriptErrorFromPipeline } from "@/script-engine/utils/script-errors";

interface ScriptOutputPanelProps {
  tabId: string;
  compact?: boolean;
}

export function ScriptOutputPanel({ tabId, compact }: ScriptOutputPanelProps) {
  const dispatch = useAppDispatch();
  const scriptState = useAppSelector((s) => s.scriptExecution.byTab[tabId]);

  const variableChanges = [
    ...(scriptState?.preRequest?.variableChanges ?? []),
    ...(scriptState?.postResponse?.variableChanges ?? []),
    ...(scriptState?.tests?.variableChanges ?? []),
  ];

  const scriptError = getScriptErrorFromPipeline(scriptState?.pipeline);

  return (
    <ScriptConsole
      logs={scriptState?.logs ?? []}
      variableChanges={variableChanges}
      error={scriptError?.error}
      errorPhase={scriptError?.phase}
      compact={compact}
      onClear={() => dispatch(clearScriptExecution(tabId))}
    />
  );
}
