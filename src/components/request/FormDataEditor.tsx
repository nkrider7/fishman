import { FileUp, Plus, Trash2, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { VariableAwareInput } from "@/components/common/VariableAwareInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormDataField, FormDataFieldType } from "@/types/request";
import { createFormDataField } from "@/types/request";

interface FormDataEditorProps {
  items: FormDataField[];
  onChange: (items: FormDataField[]) => void;
  collectionId?: string | null;
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function FormDataEditor({
  items,
  onChange,
  collectionId = null,
}: FormDataEditorProps) {
  const updateItem = (id: string, changes: Partial<FormDataField>) => {
    onChange(
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  };

  const addItem = () => onChange([...items, createFormDataField()]);

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const selectFile = async (id: string) => {
    const selected = await open({ multiple: false, directory: false });
    if (!selected) return;

    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) return;

    updateItem(id, {
      filePath: path,
      value: basename(path),
      type: "file",
    });
  };

  const clearFile = (id: string) => {
    updateItem(id, { filePath: undefined, value: "" });
  };

  const handleTypeChange = (id: string, type: FormDataFieldType) => {
    if (type === "text") {
      updateItem(id, { type, filePath: undefined });
    } else {
      updateItem(id, { type, value: "" });
    }
  };

  return (
    <div className="space-y-1">
      {items.length > 0 && (
        <div className="grid grid-cols-[28px_minmax(0,1fr)_100px_minmax(0,1.6fr)_36px] items-center gap-x-2 px-1 pb-1">
          <span />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Key
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Type
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Value / File
          </span>
          <span />
        </div>
      )}

      {items.length === 0 && (
        <p className="px-1 py-4 text-sm text-muted-foreground">
          No form fields yet. Add a field to build multipart/form-data body.
        </p>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className="grid grid-cols-[28px_minmax(0,1fr)_100px_minmax(0,1.6fr)_36px] items-center gap-x-2 rounded-md px-1 py-0.5 hover:bg-muted/20"
        >
          <Checkbox
            checked={item.enabled}
            onCheckedChange={(checked) =>
              updateItem(item.id, { enabled: checked === true })
            }
            className="h-4 w-4"
            aria-label="Enable field"
          />

          <VariableAwareInput
            inputSize="sm"
            placeholder="Field name"
            value={item.key}
            collectionId={collectionId}
            onChange={(key) => updateItem(item.id, { key })}
          />

          <Select
            value={item.type}
            onValueChange={(v) =>
              handleTypeChange(item.id, v as FormDataFieldType)
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="file">File</SelectItem>
            </SelectContent>
          </Select>

          {item.type === "text" ? (
            <VariableAwareInput
              inputSize="sm"
              placeholder="Value or {{variable}}"
              value={item.value}
              collectionId={collectionId}
              onChange={(value) => updateItem(item.id, { value })}
            />
          ) : (
            <div className="flex min-w-0 items-center gap-1">
              {item.filePath ? (
                <>
                  <span
                    className="min-w-0 flex-1 truncate rounded-md border border-input bg-muted/30 px-2 py-1.5 text-xs"
                    title={item.filePath}
                  >
                    {item.value || basename(item.filePath)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 px-2 text-xs"
                    onClick={() => selectFile(item.id)}
                  >
                    <FileUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => clearFile(item.id)}
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  className="h-8 w-full justify-start text-xs"
                  onClick={() => selectFile(item.id)}
                >
                  <FileUp className="h-3.5 w-3.5" />
                  Select File
                </Button>
              )}
            </div>
          )}

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
        Add Field
      </Button>
    </div>
  );
}
