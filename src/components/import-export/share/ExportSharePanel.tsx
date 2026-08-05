import { useMemo, useState } from "react";
import {
  FileJson,
  FileCode2,
  Download,
  Sparkles,
} from "lucide-react";
import { useAppSelector } from "@/hooks/redux";
import {
  assembleCollectionExportData,
  FUTURE_SHARE_FORMATS,
  runCollectionExport,
} from "@/import-export";
import { rowToRequest } from "@/services/dbService";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";

type ShareExportFormatId = "fishman" | "postman";

interface ExportSharePanelProps {
  collectionId: string;
  onDone: () => void;
}

const FORMAT_CARDS: Array<{
  id: ShareExportFormatId;
  title: string;
  description: string;
  bullets: string[];
  bestFor: string;
  recommended?: boolean;
  icon: typeof FileJson;
}> = [
  {
    id: "fishman",
    title: "Fishman Collection (JSON)",
    description: "Native Fishman format in a single .fishman.json file.",
    bullets: [
      "Folders, requests, and collection structure preserved",
      "Re-import directly into Fishman",
      "Best fidelity for Fishman-specific features",
    ],
    bestFor: "Sharing with Fishman users, backups.",
    recommended: true,
    icon: FileJson,
  },
  {
    id: "postman",
    title: "Postman Collection",
    description: "Postman Collection v2.1 JSON for broad compatibility.",
    bullets: [
      "Open in Postman or compatible clients",
      "Standard collection schema",
      "Good for handoffs outside Fishman",
    ],
    bestFor: "Team members on Postman.",
    icon: FileCode2,
  },
];

export function ExportSharePanel({
  collectionId,
  onDone,
}: ExportSharePanelProps) {
  const folders = useAppSelector((s) => s.collections.folders);
  const requests = useAppSelector((s) => s.collections.requests);
  const collectionEnvironments = useAppSelector(
    (s) => s.environments.collectionEnvironments,
  );

  const [formatId, setFormatId] = useState<ShareExportFormatId>("fishman");
  const [includeVariables, setIncludeVariables] = useState(true);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportData = useMemo(
    () =>
      assembleCollectionExportData(
        collectionId,
        folders,
        requests,
        rowToRequest,
      ),
    [collectionId, folders, requests],
  );

  const requestCount = exportData?.requests.length ?? 0;
  const folderCount = exportData
    ? exportData.folders.filter((f) => f.id !== exportData.rootFolder.id)
        .length
    : 0;

  const handleProceed = async () => {
    if (!exportData) {
      setError("Collection not found");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const result = await runCollectionExport({
        formatId,
        exportData: {
          ...exportData,
          variables: [],
        },
        environments: collectionEnvironments[collectionId] ?? [],
        options: {
          includeVariables,
          includeSecrets,
          includeMetadata,
        },
      });
      if (result.status === "saved") onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (!exportData) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="text-sm text-muted-foreground">Collection not found.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-1">
        <p className="text-sm text-muted-foreground">
          Export a portable file others can import. Fishman keeps full fidelity;
          Postman is available for interoperability.
        </p>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {exportData.rootFolder.name}
          </span>
          {" · "}
          {folderCount} folders · {requestCount} requests
        </div>

        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Fishman format
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {FORMAT_CARDS.filter((c) => c.id === "fishman").map((card) => {
              const Icon = card.icon;
              const selected = formatId === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setFormatId(card.id)}
                  className={cn(
                    "flex h-full flex-col rounded-lg border p-3.5 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "hover:bg-muted/50",
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                        <Icon className="h-4 w-4 text-primary" />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold">
                            {card.title}
                          </span>
                          {card.recommended ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              <Sparkles className="h-2.5 w-2.5" />
                              Recommended
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {card.description}
                  </p>
                  <ul className="mb-3 space-y-1 text-xs text-muted-foreground">
                    {card.bullets.map((b) => (
                      <li key={b} className="flex gap-1.5">
                        <span className="text-primary">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-auto text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      Best for:
                    </span>{" "}
                    {card.bestFor}
                  </p>
                </button>
              );
            })}

            <div className="flex h-full flex-col rounded-lg border border-dashed p-3.5 opacity-60">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <FileJson className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">
                      Fishman folder (ZIP)
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                      Soon
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Multi-file folder structure for git-friendly sharing — coming
                soon. Use the Git tab for fishman/ on disk today.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Other formats
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {FORMAT_CARDS.filter((c) => c.id === "postman").map((card) => {
              const Icon = card.icon;
              const selected = formatId === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setFormatId(card.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "hover:bg-muted/50",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{card.title}</div>
                    <p className="text-xs text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                </button>
              );
            })}

            {FUTURE_SHARE_FORMATS.map((fmt) => (
              <div
                key={fmt.id}
                className="flex items-start gap-3 rounded-lg border border-dashed p-3 opacity-50"
                title="Coming soon"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Download className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    {fmt.label}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-normal">
                      Soon
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmt.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <Label>Include</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
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
          {includeSecrets ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Secrets will be written into the export file. Only share with
              people you trust.
            </p>
          ) : null}
        </section>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onDone} disabled={exporting}>
          Cancel
        </Button>
        <Button onClick={() => void handleProceed()} disabled={exporting}>
          <Download className="h-4 w-4" />
          {exporting ? "Exporting…" : "Proceed"}
        </Button>
      </div>
    </div>
  );
}
