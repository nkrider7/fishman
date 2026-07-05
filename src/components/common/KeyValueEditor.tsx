import { Plus, Trash2 } from "lucide-react";
import { VariableAwareInput } from "@/components/common/VariableAwareInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { KeyValue } from "@/types/request";
import { createKeyValue } from "@/types/request";
import { cn } from "@/utils/cn";

interface KeyValueEditorProps {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  collectionId?: string | null;
}

export function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  collectionId = null,
}: KeyValueEditorProps) {
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
    <div className="space-y-1 py-1">
      {items.length > 0 && (
        <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_36px] items-center gap-x-2 px-1 pb-1">
          <span />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Key
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Value
          </span>
          <span />
        </div>
      )}

      {items.length === 0 && (
        <p className="px-1 py-4 text-sm text-muted-foreground">No items yet.</p>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_36px] items-center gap-x-2 rounded-md px-1 py-0.5 hover:bg-muted/20"
        >
          <Checkbox
            checked={item.enabled}
            onCheckedChange={(checked) =>
              updateItem(item.id, "enabled", checked === true)
            }
            className="h-4 w-4"
          />
          <VariableAwareInput
            inputSize="sm"
            placeholder={keyPlaceholder}
            value={item.key}
            collectionId={collectionId}
            onChange={(key) => updateItem(item.id, "key", key)}
            className={cn(item.key.includes("{{") && "font-mono")}
          />
          <VariableAwareInput
            inputSize="sm"
            placeholder={valuePlaceholder}
            value={item.value}
            collectionId={collectionId}
            onChange={(val) => updateItem(item.id, "value", val)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => removeItem(item.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={addItem}>
        <Plus className="h-3.5 w-3.5" />
        Add
      </Button>
    </div>
  );
}
