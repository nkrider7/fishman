import { useState } from "react";
import {
  Box,
  Download,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Import,
  MoreVertical,
  Plus,
  ScanSearch,
  Search,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  closeFilesystemProject,
  openGitUiTab,
  openProjectAndGitUi,
  refreshFilesystemCollections,
} from "@/store/thunks/gitThunks";

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
  const sourceMode = useAppSelector((s) => s.collections.sourceMode);
  const fsProjectName = useAppSelector(
    (s) => s.collections.filesystemProjectName,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importPayload, setImportPayload] = useState<{
    content: string;
    filename?: string;
  } | null>(null);

  const isFilesystem = sourceMode === "filesystem";

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
          <div className="flex min-w-0 flex-col gap-0.5 pl-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Box className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {isFilesystem ? (fsProjectName ?? "Project") : "Collections"}
              </span>
            </div>
            {isFilesystem ? (
              <span className="truncate text-[10px] text-muted-foreground">
                Git project · fishman/
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5">
            {isFilesystem ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Close git project (return to local)"
                onClick={() => void dispatch(closeFilesystemProject())}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Open Git UI"
              onClick={() => void dispatch(openGitUiTab())}
            >
              <GitBranch className="h-3.5 w-3.5" />
            </Button>
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
            {/*yep*/}
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  <Plus className="text-muted-foreground" />
                  Create collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenImport}>
                  <FolderOpen className="text-muted-foreground" />
                  Import collection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <Import className="text-muted-foreground" />
                  Import from file…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => dispatch(openScanner())}>
                  <ScanSearch className="text-muted-foreground" />
                  Scan backend project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void dispatch(openProjectAndGitUi())}
                >
                  <FolderGit2 className="text-muted-foreground" />
                  Open Git project…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void dispatch(openGitUiTab())}>
                  <GitBranch className="text-muted-foreground" />
                  Git UI
                </DropdownMenuItem>
                {isFilesystem ? (
                  <DropdownMenuItem
                    onClick={() => void dispatch(refreshFilesystemCollections())}
                  >
                    Refresh from disk
                  </DropdownMenuItem>
                ) : null}
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
              placeholder="Search… or method:QUERY"
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
