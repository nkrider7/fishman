import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileJson,
  Folder,
  Upload,
} from "lucide-react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { confirmCollectionImport } from "@/store/slices/collectionsSlice";
import {
  buildImportPreview,
  detectImportFormat,
  type ImportConflictStrategy,
  type ImportPreview,
} from "@/import-export";
import { findConflictingRoot } from "@/import-export/core/conflict";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent?: string;
  initialFilename?: string;
}

export function ImportDialog({
  open,
  onOpenChange,
  initialContent,
  initialFilename,
}: ImportDialogProps) {
  const dispatch = useAppDispatch();
  const folders = useAppSelector((s) => s.collections.folders);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filename, setFilename] = useState<string | undefined>();
  const [content, setContent] = useState<string>("");
  const [strategy, setStrategy] = useState<ImportConflictStrategy>("duplicate");
  const [importing, setImporting] = useState(false);

  const loadContent = useCallback((text: string, name?: string) => {
    setContent(text);
    setFilename(name);
    const formatId = detectImportFormat(text, name) ?? undefined;
    setPreview(buildImportPreview(text, name, formatId));
  }, []);

  useEffect(() => {
    if (open && initialContent) {
      loadContent(initialContent, initialFilename);
    }
    if (!open) {
      setPreview(null);
      setContent("");
      setFilename(undefined);
      setStrategy("duplicate");
    }
  }, [open, initialContent, initialFilename, loadContent]);

  const hasConflict =
    preview?.result &&
    !!findConflictingRoot(preview.result, folders);

  const handlePickFile = async () => {
    const selected = await openFileDialog({
      multiple: false,
      filters: [
        { name: "Collections", extensions: ["json", "fishman.json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (!selected || typeof selected !== "string") return;
    const text = await readTextFile(selected);
    const name = selected.split(/[/\\]/).pop();
    loadContent(text, name);
  };

  const handleImport = async () => {
    if (!preview?.result || !content) return;
    setImporting(true);
    try {
      await dispatch(
        confirmCollectionImport({
          content,
          filename,
          formatId: preview.formatId,
          strategy,
        }),
      ).unwrap();
      onOpenChange(false);
    } finally {
      setImporting(false);
    }
  };

  const canImport =
    preview?.result && preview.errors.length === 0 && !importing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Collection</DialogTitle>
        </DialogHeader>

        {!preview ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8",
              "hover:border-primary/50 hover:bg-muted/30",
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-center text-sm text-muted-foreground">
              Drop a Fishman or Postman collection file here, or browse to select
              one.
            </p>
            <Button variant="outline" onClick={handlePickFile}>
              <FileJson className="h-4 w-4" />
              Choose file
            </Button>
          </div>
        ) : preview.errors.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="space-y-2">
                {preview.errors.map((err, i) => (
                  <div key={i}>
                    <p className="font-medium">{err.message}</p>
                    {err.suggestion && (
                      <p className="text-muted-foreground">{err.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <Button variant="outline" onClick={handlePickFile}>
              Try another file
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {preview.collectionName}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Format: {preview.formatLabel}
                {filename ? ` · ${filename}` : ""}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md bg-muted/50 p-2">
                <div className="font-semibold">{preview.folderCount}</div>
                <div className="text-xs text-muted-foreground">Folders</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="font-semibold">{preview.requestCount}</div>
                <div className="text-xs text-muted-foreground">Requests</div>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <div className="font-semibold">{preview.variableCount}</div>
                <div className="text-xs text-muted-foreground">Variables</div>
              </div>
            </div>

            {preview.folderNames.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Top-level folders
                </p>
                <div className="flex flex-wrap gap-1">
                  {preview.folderNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
                    >
                      <Folder className="h-3 w-3" />
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">Warnings ({preview.warnings.length})</p>
                {preview.warnings.slice(0, 5).map((w, i) => (
                  <p key={i} className="text-muted-foreground">
                    {w.path ? `${w.path}: ` : ""}
                    {w.message}
                  </p>
                ))}
              </div>
            )}

            {hasConflict && (
              <div className="space-y-2">
                <Label className="text-sm">
                  A collection named &quot;{preview.collectionName}&quot; already
                  exists
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["duplicate", "Duplicate"],
                      ["merge", "Merge"],
                      ["replace", "Replace"],
                      ["skip", "Skip"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStrategy(value)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm transition-colors",
                        strategy === value
                          ? "border-primary bg-primary/10"
                          : "hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {preview && preview.errors.length === 0 && (
            <Button onClick={handleImport} disabled={!canImport}>
              {importing ? "Importing…" : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
