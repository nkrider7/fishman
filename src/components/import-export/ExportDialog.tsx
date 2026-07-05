import { useState } from "react";
import { Download } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useAppSelector } from "@/hooks/redux";
import {
  assembleCollectionExportData,
  exportCollectionContent,
  importExportRegistry,
} from "@/import-export";
import { rowToRequest } from "@/services/dbService";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string | null;
}

const EXPORT_FORMATS = importExportRegistry.getExporters();

const FUTURE_FORMATS = [
  { id: "bruno", label: "Bruno" },
  { id: "openapi", label: "OpenAPI" },
  { id: "har", label: "HAR" },
  { id: "insomnia", label: "Insomnia" },
];

export function ExportDialog({
  open,
  onOpenChange,
  collectionId,
}: ExportDialogProps) {
  const folders = useAppSelector((s) => s.collections.folders);
  const requests = useAppSelector((s) => s.collections.requests);
  const collectionEnvironments = useAppSelector(
    (s) => s.environments.collectionEnvironments,
  );

  const [formatId, setFormatId] = useState("fishman");
  const [includeVariables, setIncludeVariables] = useState(true);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [exporting, setExporting] = useState(false);

  const rootFolder = collectionId
    ? folders.find((f) => f.id === collectionId)
    : null;

  const exportData =
    collectionId && rootFolder
      ? assembleCollectionExportData(
          collectionId,
          folders,
          requests,
          rowToRequest,
        )
      : null;

  const requestCount = exportData?.requests.length ?? 0;
  const folderCount = exportData
    ? exportData.folders.filter((f) => f.id !== exportData.rootFolder.id).length
    : 0;

  const handleExport = async () => {
    if (!exportData) return;
    const exporter = importExportRegistry.getExporter(formatId);
    if (!exporter) return;

    setExporting(true);
    try {
      const content = exportCollectionContent(formatId, {
        data: {
          ...exportData,
          variables: [],
          environments: collectionId
            ? collectionEnvironments[collectionId] ?? []
            : [],
        },
        options: {
          includeVariables,
          includeSecrets,
          includeMetadata,
        },
      });

      const defaultName = `${exportData.rootFolder.name}.${exporter.defaultExtension}`;
      const path = await save({
        filters: [
          {
            name: exporter.name,
            extensions: exporter.defaultExtension.split(".").slice(-1),
          },
        ],
        defaultPath: defaultName,
      });

      if (path) {
        await writeTextFile(path, content);
        onOpenChange(false);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Collection</DialogTitle>
        </DialogHeader>

        {!rootFolder ? (
          <p className="text-sm text-muted-foreground">
            Select a collection to export.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{rootFolder.name}</p>
              <p className="text-muted-foreground">
                {folderCount} folders · {requestCount} requests
              </p>
            </div>

            <div className="space-y-2">
              <Label>Export as</Label>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_FORMATS.map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setFormatId(fmt.id)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      formatId === fmt.id
                        ? "border-primary bg-primary/10"
                        : "hover:bg-muted",
                    )}
                  >
                    {fmt.name}
                  </button>
                ))}
                {FUTURE_FORMATS.map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    disabled
                    className="rounded-md border px-3 py-2 text-left text-sm opacity-50"
                    title="Coming soon"
                  >
                    {fmt.label} (soon)
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Include</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeVariables}
                    onCheckedChange={(v) => setIncludeVariables(v === true)}
                  />
                  Variables
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeMetadata}
                    onCheckedChange={(v) => setIncludeMetadata(v === true)}
                  />
                  Metadata
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeSecrets}
                    onCheckedChange={(v) => setIncludeSecrets(v === true)}
                  />
                  Secrets (tokens, passwords)
                </label>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={!exportData || exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
