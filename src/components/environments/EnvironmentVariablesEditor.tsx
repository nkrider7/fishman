import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { KeyValue } from "@/types/request";
import { createKeyValue } from "@/types/request";
import { cn } from "@/utils/cn";

interface EnvironmentVariablesEditorProps {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
}

export function EnvironmentVariablesEditor({
  items,
  onChange,
}: EnvironmentVariablesEditorProps) {
  const updateItem = (
    id: string,
    field: keyof KeyValue,
    value: string | boolean,
  ) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addItem = () => onChange([...items, createKeyValue()]);

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="sticky top-0 z-10 grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_36px] items-center gap-x-2 rounded-md bg-background/95 px-1 py-1.5 backdrop-blur-sm">
        <span />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Variable
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Value
        </span>
        <span />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/80 px-4 py-10 text-center">
          <p className="text-xs text-muted-foreground">
            No variables yet. Add one to use {"{{name}}"} in requests.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-8 text-xs"
            onClick={addItem}
          >
            <Plus className="h-3.5 w-3.5" />
            Add variable
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_36px] items-center gap-x-2 rounded-lg border border-transparent px-1 py-1 transition-colors hover:border-border/50 hover:bg-muted/30"
            >
              <Checkbox
                checked={item.enabled}
                onCheckedChange={(checked) =>
                  updateItem(item.id, "enabled", checked === true)
                }
                className="h-4 w-4"
                aria-label={`Enable ${item.key || "variable"}`}
              />
              <Input
                placeholder="variable_name"
                value={item.key}
                onChange={(e) => updateItem(item.id, "key", e.target.value)}
                className={cn(
                  "h-8 border-input/60 bg-background font-mono text-xs",
                  item.key && "text-[#49cc90]",
                )}
                spellCheck={false}
              />
              <Input
                placeholder="value"
                value={item.value}
                onChange={(e) => updateItem(item.id, "value", e.target.value)}
                className="h-8 border-input/60 bg-background font-mono text-xs"
                spellCheck={false}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(item.id)}
                title="Remove variable"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={addItem}
        >
          <Plus className="h-3.5 w-3.5" />
          Add variable
        </Button>
      )}
    </div>
  );
}
