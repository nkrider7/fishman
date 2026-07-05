import { useState } from "react";
import {
  Box,
  Download,
  FolderOpen,
  Import,
  MoreVertical,
  Plus,
  ScanSearch,
  Search,
} from "lucide-react";
import { useAppDispatch } from "@/hooks/redux";
import {
  createCollection,
  openImportDialog,
  setSearchQuery,
} from "@/store/slices/collectionsSlice";
import { openScanner } from "@/store/slices/scannerSlice";
import { ScannerDialog } from "@/components/scanner/ScannerDialog";
import { ImportDialog } from "@/components/import-export/ImportDialog";
import { ExportDialog } from "@/components/import-export/ExportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CollectionHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showSearch: boolean;
  onToggleSearch: () => void;
  selectedCollectionId?: string | null;
}

export function CollectionHeader({
  searchQuery,
  onSearchChange,
  showSearch,
  onToggleSearch,
  selectedCollectionId = null,
}: CollectionHeaderProps) {
  const dispatch = useAppDispatch();
  const [createOpen, setCreateOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<{
    content: string;
    filename?: string;
  } | null>(null);

  const handleOpenImport = async () => {
    const result = await dispatch(openImportDialog()).unwrap();
    if (result) {
      setImportPayload(result);
      setImportOpen(true);
    }
  };

  const handleCreate = () => {
    const name = collectionName.trim() || "New Collection";
    dispatch(createCollection(name));
    setCollectionName("");
    setCreateOpen(false);
  };

  return (
    <>
      <div className="flex flex-col border-b">
        <div className="flex items-center justify-between py-2 pl-0 pr-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Box className="h-4 w-4 text-muted-foreground" />
            Collections
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onToggleSearch}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Create collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenImport}>
                  <FolderOpen className="h-4 w-4" />
                  Import collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <Import className="h-4 w-4" />
                  Import from file…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => dispatch(openScanner())}>
                  <ScanSearch className="h-4 w-4" />
                  Scan backend project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  New collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenImport}>
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setExportOpen(true)}
                  disabled={!selectedCollectionId}
                >
                  <Download className="h-4 w-4" />
                  Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {showSearch && (
          <div className="pb-2 pl-2 pr-3">
            <Input
              placeholder="Search collections..."
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                dispatch(setSearchQuery(e.target.value));
              }}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create collection</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Collection name"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScannerDialog />

      <ImportDialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportPayload(null);
        }}
        initialContent={importPayload?.content}
        initialFilename={importPayload?.filename}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        collectionId={selectedCollectionId}
      />
    </>
  );
}
