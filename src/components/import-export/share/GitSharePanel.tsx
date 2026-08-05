import { GitBranch } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { Button } from "@/components/ui/button";
import {
  initializeCollectionGit,
  openGitUiTab,
} from "@/store/thunks/gitThunks";

interface GitSharePanelProps {
  collectionId: string;
  onDone: () => void;
}

export function GitSharePanel({ collectionId, onDone }: GitSharePanelProps) {
  const dispatch = useAppDispatch();
  const sourceMode = useAppSelector((s) => s.collections.sourceMode);
  const gitBusy = useAppSelector((s) => s.git.busy);
  const gitStatus = useAppSelector((s) => s.git.status);
  const isFilesystem = sourceMode === "filesystem";
  const hasGit = Boolean(gitStatus?.enabled);

  const handlePrimary = () => {
    if (isFilesystem && hasGit) {
      void dispatch(openGitUiTab());
      onDone();
      return;
    }
    void dispatch(initializeCollectionGit(collectionId));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
        <p className="text-sm text-muted-foreground">
          Share through version control by exporting this collection into a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            fishman/
          </code>{" "}
          folder on disk and initializing a Git repository (Bruno-style).
        </p>

        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <GitBranch className="h-4 w-4 text-primary" />
            </span>
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-semibold">Git-native collection</h3>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Requests stored as JSON under fishman/</li>
                <li>• Commit, branch, and review like source code</li>
                <li>• Collaborate via pull requests</li>
              </ul>
            </div>
          </div>

          {isFilesystem && hasGit ? (
            <p className="text-xs text-muted-foreground">
              This collection is already on disk with Git enabled. Open the Git
              UI to commit or inspect changes.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Initialize Git to export the collection to a folder and set up a
              repository.
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={handlePrimary} disabled={gitBusy}>
          <GitBranch className="h-4 w-4" />
          {isFilesystem && hasGit
            ? "Open Git UI"
            : gitBusy
              ? "Working…"
              : "Initialize Git"}
        </Button>
      </div>
    </div>
  );
}
