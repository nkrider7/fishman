import { GitBranch, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setGitView } from "@/store/slices/gitSlice";
import {
  refreshGitStatus,
  stageGitPaths,
} from "@/store/thunks/gitThunks";

interface GitChangesHomeProps {
  onAddRemote: () => void;
}

/**
 * Main pane when Changes is active and no file diff is selected.
 * Guides the next step instead of dumping the remote empty wall.
 */
export function GitChangesHome({ onAddRemote }: GitChangesHomeProps) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.git.status);
  const commits = useAppSelector((s) => s.git.commits);
  const busy = useAppSelector((s) => s.git.busy);

  const changes = status?.changes ?? [];
  const staged = changes.filter((c) => c.staged);
  const unstaged = changes.filter((c) => !c.staged);
  const branch = status?.branch ?? "main";
  const hasRemote = Boolean(status?.hasRemote);
  const unborn = commits.length === 0;

  const stageAll = () => {
    if (unstaged.length === 0) return;
    void dispatch(stageGitPaths(unstaged.map((c) => c.path)));
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <GitBranch className="h-6 w-6 text-foreground" />
      </div>

      <div className="max-w-md space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          {branch}
          {unborn ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (no commits yet)
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-muted-foreground">
          {changes.length === 0
            ? "Working tree clean. Select a changed file in the sidebar to view its diff."
            : "Select a file in the sidebar to view its diff, or follow the next step below."}
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2">
        {unstaged.length > 0 && staged.length === 0 ? (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy}
            onClick={stageAll}
          >
            <Plus className="h-3.5 w-3.5" />
            Stage all {unstaged.length} file{unstaged.length === 1 ? "" : "s"}
          </Button>
        ) : null}

        {staged.length > 0 ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {staged.length} file{staged.length === 1 ? "" : "s"} staged — enter a
            commit message in the sidebar and click{" "}
            <span className="font-medium text-foreground">Commit Changes</span>.
          </p>
        ) : null}

        {unborn && changes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Save requests (Ctrl+S) so they appear under{" "}
            <code className="text-[10px]">fishman/</code>, then stage and commit.
          </p>
        ) : null}

        {!hasRemote && commits.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border px-3 py-3 text-left">
            <p className="text-xs font-medium text-foreground">
              Connect a remote (optional)
            </p>
            <p className="text-[11px] text-muted-foreground">
              Add an existing GitHub/GitLab URL to push and pull this project.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onAddRemote}
            >
              Add Remote
            </Button>
          </div>
        ) : null}

        {hasRemote ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch(setGitView("sync"))}
          >
            Open Sync (fetch / pull / push)
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          disabled={busy}
          onClick={() => void dispatch(refreshGitStatus())}
        >
          <RefreshCw className="h-3 w-3" />
          Refresh status
        </Button>
      </div>
    </div>
  );
}
