import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GenerateDocsDialog } from "../GenerateDocsDialog";

interface EmbedSharePanelProps {
  collectionId: string;
  onDone: () => void;
}

export function EmbedSharePanel({
  collectionId,
  onDone,
}: EmbedSharePanelProps) {
  const [docsOpen, setDocsOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
        <p className="text-sm text-muted-foreground">
          Publish-ready documentation for this collection. Generate a standalone
          HTML file your team can open in any browser.
        </p>

        <button
          type="button"
          onClick={() => setDocsOpen(true)}
          className="flex w-full items-start gap-3 rounded-lg border p-3.5 text-left transition-colors hover:bg-muted/50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/5">
            <BookOpen className="h-5 w-5 text-primary" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              Documentation
            </span>
            <span className="mt-0.5 block text-xs font-medium text-primary">
              Generate Docs
            </span>
          </span>
        </button>
      </div>

      <div className="flex shrink-0 justify-end border-t pt-3">
        <Button variant="outline" onClick={onDone}>
          Close
        </Button>
      </div>

      <GenerateDocsDialog
        open={docsOpen}
        onOpenChange={setDocsOpen}
        collectionId={collectionId}
      />
    </div>
  );
}
