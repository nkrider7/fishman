import { Plus, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setGitCommitMessage } from "@/store/slices/gitSlice";
import {
  commitGitChanges,
  discardGitPaths,
  refreshGitStatus,
  selectGitFileDiff,
  stageGitPaths,
  unstageGitPaths,
} from "@/store/thunks/gitThunks";
import { GitFileList } from "./GitFileList";

export function GitChangesPanel() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.git.status);
  const message = useAppSelector((s) => s.git.commitMessage);
  const selectedDiff = useAppSelector((s) => s.git.selectedDiff);
  const busy = useAppSelector((s) => s.git.busy);
  const commits = useAppSelector((s) => s.git.commits);

  const changes = status?.changes ?? [];
  const staged = changes.filter((c) => c.staged);
  const unstaged = changes.filter((c) => !c.staged);
  const canCommit = Boolean(message.trim()) && staged.length > 0 && !busy;

  const stageAll = () => {
    void dispatch(stageGitPaths(unstaged.map((c) => c.path)));
  };
  const discardAll = () => {
    if (unstaged.length === 0) return;
    const ok = window.confirm(
      `Discard local changes in ${unstaged.length} file(s)? This cannot be undone.`,
    );
    if (!ok) return;
    void dispatch(discardGitPaths(unstaged.map((c) => c.path)));
  };

  const tryCommit = () => {
    if (!canCommit) return;
    void dispatch(commitGitChanges());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <textarea
          className="min-h-[72px] w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring"
          placeholder={
            commits.length === 0
              ? "First commit message (e.g. Initial commit)"
              : "Enter commit message..."
          }
          value={message}
          disabled={busy}
          aria-label="Commit message"
          onChange={(e) => dispatch(setGitCommitMessage(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              tryCommit();
            }
          }}
        />
        <Button
          className="w-full"
          size="sm"
          disabled={!canCommit}
          onClick={tryCommit}
          title={
            staged.length === 0
              ? "Stage files before committing"
              : !message.trim()
                ? "Enter a commit message"
                : "Commit (Ctrl/Cmd+Enter)"
          }
        >
          Commit Changes
          {staged.length > 0 ? ` (${staged.length})` : ""}
        </Button>
        {unstaged.length > 0 && staged.length === 0 ? (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Tip: click{" "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-2 hover:underline"
              disabled={busy}
              onClick={stageAll}
            >
              Stage all
            </button>{" "}
            ({unstaged.length}), then commit.
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {staged.length === 0 && unstaged.length === 0 ? (
          <div className="space-y-2 px-3 py-4">
            <p className="text-xs font-medium text-foreground">
              Nothing to commit
            </p>
            <p className="text-[11px] text-muted-foreground/90">
              Create or save requests (Ctrl+S) — they write into{" "}
              <code className="text-[10px]">fishman/</code> and show up here.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              disabled={busy}
              onClick={() => void dispatch(refreshGitStatus())}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Staged ({staged.length})
              </span>
            </div>
            <GitFileList
              mode="staged"
              files={staged}
              selectedPath={selectedDiff?.path ?? null}
              selectedStaged={selectedDiff ? selectedDiff.staged : null}
              onSelect={(file) =>
                void dispatch(
                  selectGitFileDiff({ path: file.path, staged: true }),
                )
              }
              onUnstageOne={(path) => void dispatch(unstageGitPaths([path]))}
            />

            <div className="mt-1 flex items-center justify-between border-t border-border/60 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Changes ({unstaged.length})
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Discard all unstaged"
                  aria-label="Discard all unstaged"
                  disabled={busy || unstaged.length === 0}
                  onClick={discardAll}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title={`Stage all (${unstaged.length})`}
                  aria-label="Stage all"
                  disabled={busy || unstaged.length === 0}
                  onClick={stageAll}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <GitFileList
              mode="unstaged"
              files={unstaged}
              selectedPath={selectedDiff?.path ?? null}
              selectedStaged={selectedDiff ? selectedDiff.staged : null}
              onSelect={(file) =>
                void dispatch(
                  selectGitFileDiff({ path: file.path, staged: false }),
                )
              }
              onStageOne={(path) => void dispatch(stageGitPaths([path]))}
            />
          </>
        )}
      </div>
    </div>
  );
}
