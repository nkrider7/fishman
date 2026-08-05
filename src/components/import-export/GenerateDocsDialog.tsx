import { useMemo, useState } from "react";
import { BookOpen, Check, Loader2 } from "lucide-react";
import { useAppSelector } from "@/hooks/redux";
import {
  assembleCollectionExportData,
  buildDocumentationHtml,
  documentationDefaultFileName,
  saveTextFile,
} from "@/import-export";
import { rowToRequest } from "@/services/dbService";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GenerateDocsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string | null;
}

const FEATURES = [
  "Standalone HTML file — no server required",
  "Request docs with params, body, scripts & code snippets",
  "Host on any static file server",
] as const;

export function GenerateDocsDialog({
  open,
  onOpenChange,
  collectionId,
}: GenerateDocsDialogProps) {
  const folders = useAppSelector((s) => s.collections.folders);
  const requests = useAppSelector((s) => s.collections.requests);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportData = useMemo(() => {
    if (!collectionId) return null;
    return assembleCollectionExportData(
      collectionId,
      folders,
      requests,
      rowToRequest,
    );
  }, [collectionId, folders, requests]);

  const requestCount = exportData?.requests.length ?? 0;
  const folderCount = exportData
    ? exportData.folders.filter((f) => f.id !== exportData.rootFolder.id).length
    : 0;

  const handleGenerate = async () => {
    if (!exportData) {
      setError("Collection not found");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const html = buildDocumentationHtml(exportData, {
        includeSecrets: false,
        theme: "light",
      });
      const result = await saveTextFile({
        content: html,
        defaultPath: documentationDefaultFileName(exportData.rootFolder.name),
        filterName: "HTML Documentation",
        extensions: ["html"],
      });
      if (result.status === "saved") {
        onOpenChange(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate documentation",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Documentation</DialogTitle>
        </DialogHeader>

        {!exportData ? (
          <p className="text-sm text-muted-foreground">
            Collection not found.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="h-4 w-4 text-primary" />
                Interactive API Documentation
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Generate a standalone HTML file that can be hosted anywhere or
                shared with your team. Docs show all requests — no Try / Run
                playground.
              </p>
            </div>

            <ul className="space-y-2">
              {FEATURES.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 text-sm text-foreground"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {exportData.rootFolder.name}
              </span>
              {" · "}
              {folderCount} folders · {requestCount} requests
            </div>

            <p className="text-xs text-muted-foreground">
              The generated file loads Bruno/OpenCollection CSS and JS from a
              CDN for fonts and layout, which requires an internet connection.
              The page is branded Fishman and hides Try / Run controls.
            </p>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleGenerate()}
            disabled={!exportData || busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            {busy ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
