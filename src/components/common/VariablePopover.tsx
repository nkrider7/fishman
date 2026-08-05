import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { VariableScope } from "@/utils/variableSubstitution";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

interface VariablePopoverProps {
  name: string;
  value: string | null;
  scope: VariableScope | "unresolved";
  isLive?: boolean;
  editing?: boolean;
  canEdit?: boolean;
  /** When true, saving will create a Default environment first. */
  willCreateEnvironment?: boolean;
  editScope?: VariableScope | null;
  editEnvName?: string | null;
  style?: React.CSSProperties;
  className?: string;
  onSave?: (value: string) => void | Promise<void>;
  onCancelEdit?: () => void;
}

export function VariablePopover({
  name,
  value,
  scope,
  isLive = false,
  editing = false,
  canEdit = false,
  willCreateEnvironment = false,
  editScope = null,
  editEnvName = null,
  style,
  className,
  onSave,
  onCancelEdit,
}: VariablePopoverProps) {
  const [copied, setCopied] = useState(false);
  const [draftValue, setDraftValue] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editing) {
      cancelledRef.current = false;
      setSaving(false);
      setDraftValue(value ?? "");
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, value, name]);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const handleSave = () => {
    if (saving || !canEdit) return;
    setSaving(true);
    void Promise.resolve(onSave?.(draftValue)).finally(() => {
      setSaving(false);
    });
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    onCancelEdit?.();
  };

  const scopeLabel =
    scope === "collection"
      ? "Collection"
      : scope === "global"
        ? "Global"
        : scope === "folder"
          ? "Folder"
          : scope === "dynamic"
            ? "Dynamic"
            : "Unresolved";

  const editScopeLabel =
    editScope === "collection"
      ? "Collection"
      : editScope === "global"
        ? "Global"
        : null;

  return (
    <div
      className={cn(
        "z-50 w-72 rounded-md border border-border/80 bg-popover p-3 text-popover-foreground shadow-lg",
        className,
      )}
      style={style}
      onMouseDown={(e) => {
        // Keep underlying field from stealing focus, but allow popover
        // controls (edit input / buttons) to be interactive.
        const target = e.target as HTMLElement | null;
        if (target?.closest("input, textarea, button, [role='button']")) {
          return;
        }
        e.preventDefault();
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="truncate font-mono text-sm font-medium">{name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {isLive && (
            <Badge
              variant="outline"
              className="border-0 bg-amber-500/15 px-1.5 py-0 text-[9px] font-semibold uppercase text-amber-500"
            >
              Unsaved
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn(
              "border-0 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide",
              scope === "collection" &&
                "bg-amber-500/15 text-amber-500 dark:text-amber-400",
              scope === "global" &&
                "bg-sky-500/15 text-sky-500 dark:text-sky-400",
              scope === "folder" &&
                "bg-teal-500/15 text-teal-500 dark:text-teal-400",
              scope === "dynamic" &&
                "bg-violet-500/15 text-violet-500 dark:text-violet-400",
              scope === "unresolved" &&
                "bg-red-500/15 text-red-500 dark:text-red-400",
            )}
          >
            {scopeLabel}
          </Badge>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          {canEdit && editEnvName && editScopeLabel && (
            <p className="text-[10px] text-muted-foreground">
              Saving to{" "}
              <span className="font-medium text-foreground">{editEnvName}</span>{" "}
              ({editScopeLabel})
            </p>
          )}
          {canEdit && willCreateEnvironment && !editEnvName && (
            <p className="text-[10px] text-muted-foreground">
              Creates a{" "}
              <span className="font-medium text-foreground">Default</span>{" "}
              environment and saves there
            </p>
          )}
          <Input
            ref={inputRef}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                handleCancel();
              }
            }}
            onBlur={() => {
              if (cancelledRef.current) {
                cancelledRef.current = false;
                return;
              }
              // No-op close: don't auto-create an env when nothing changed.
              if (draftValue === (value ?? "")) {
                handleCancel();
                return;
              }
              handleSave();
            }}
            className="h-8 font-mono text-xs"
            spellCheck={false}
            disabled={!canEdit || saving}
            placeholder="Enter value"
          />
          {!canEdit ? (
            <p className="text-[10px] text-muted-foreground">
              This variable cannot be edited here.
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              Enter to save, Esc to cancel
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-2.5 py-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-mono text-xs",
                value ? "text-foreground" : "italic text-muted-foreground",
              )}
              title={value ?? undefined}
            >
              {value ?? "Not defined in active environments"}
            </span>
            {value && (
              <button
                type="button"
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Copy value"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
          {canEdit && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Double-click to edit
            </p>
          )}
        </>
      )}
    </div>
  );
}
