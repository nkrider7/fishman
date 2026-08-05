import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportSharePanel } from "./share/ExportSharePanel";
import { GitSharePanel } from "./share/GitSharePanel";
import { EmbedSharePanel } from "./share/EmbedSharePanel";

export type ShareCollectionTab = "git" | "export" | "embed";

interface ShareCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: string | null;
  /** Prefer Export when opened from a share/export action. */
  defaultTab?: ShareCollectionTab;
}

export function ShareCollectionDialog({
  open,
  onOpenChange,
  collectionId,
  defaultTab = "export",
}: ShareCollectionDialogProps) {
  const [tab, setTab] = useState<ShareCollectionTab>(defaultTab);

  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-0 border-b px-5 py-4 text-left">
          <DialogTitle>Share Collection</DialogTitle>
        </DialogHeader>

        {!collectionId ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Select a collection to share.
          </p>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as ShareCollectionTab)}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="shrink-0 border-b px-5">
              <TabsList className="h-10 w-full justify-start gap-1 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="git"
                  className="rounded-none border-b-2 border-transparent px-3 pb-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Git
                </TabsTrigger>
                <TabsTrigger
                  value="export"
                  className="rounded-none border-b-2 border-transparent px-3 pb-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Export
                </TabsTrigger>
                <TabsTrigger
                  value="embed"
                  className="rounded-none border-b-2 border-transparent px-3 pb-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Embed
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
              <TabsContent
                value="git"
                className="mt-0 h-full data-[state=inactive]:hidden"
              >
                <GitSharePanel collectionId={collectionId} onDone={close} />
              </TabsContent>
              <TabsContent
                value="export"
                className="mt-0 h-full data-[state=inactive]:hidden"
              >
                <ExportSharePanel collectionId={collectionId} onDone={close} />
              </TabsContent>
              <TabsContent
                value="embed"
                className="mt-0 h-full data-[state=inactive]:hidden"
              >
                <EmbedSharePanel
                  collectionId={collectionId}
                  onDone={close}
                />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
