import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Clock,
  FolderGit2,
  GitBranch,
  Network,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  setGitError,
  setGitSuccess,
  setGitView,
  type GitUiView,
} from "@/store/slices/gitSlice";
import {
  clearGitFileDiff,
  initGitRepo,
  openProjectAndGitUi,
  refreshFilesystemCollections,
  refreshGitStatus,
} from "@/store/thunks/gitThunks";
import { cn } from "@/utils/cn";
import { AddRemoteDialog } from "./AddRemoteDialog";
import { GitBranchSwitcher } from "./GitBranchSwitcher";
import { GitChangesHome } from "./GitChangesHome";
import { GitChangesPanel } from "./GitChangesPanel";
import { GitCommitsView } from "./GitCommitsView";
import { GitDiffViewer } from "./GitDiffViewer";
import { GitInitEmptyState } from "./GitInitEmptyState";
import { GitRemoteEmptyState } from "./GitRemoteEmptyState";
import { GitRemotesView } from "./GitRemotesView";
import { GitSyncPanel } from "./GitSyncPanel";

const LINKS: { id: GitUiView; label: string; icon: typeof Clock }[] = [
  { id: "commits", label: "Commits", icon: Clock },
  { id: "remotes", label: "Remotes", icon: Network },
  { id: "sync", label: "Sync", icon: ArrowLeftRight },
];

export function GitUiView() {
  const dispatch = useAppDispatch();
  const projectPath = useAppSelector((s) => s.git.projectPath);
  const workspaceName = useAppSelector((s) => s.git.workspaceName);
  const status = useAppSelector((s) => s.git.status);
  const view = useAppSelector((s) => s.git.view);
  const busy = useAppSelector((s) => s.git.busy);
  const lastError = useAppSelector((s) => s.git.lastError);
  const lastSuccess = useAppSelector((s) => s.git.lastSuccess);
  const selectedDiff = useAppSelector((s) => s.git.selectedDiff);
  const activeDiff = useAppSelector((s) => s.git.activeDiff);
  const diffLoading = useAppSelector((s) => s.git.diffLoading);
  const commits = useAppSelector((s) => s.git.commits);
  const collectionsMode = useAppSelector((s) => s.collections.sourceMode);
  const [addRemoteOpen, setAddRemoteOpen] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!projectPath) return;
    void dispatch(refreshGitStatus());
    if (collectionsMode !== "filesystem") {
      void dispatch(refreshFilesystemCollections());
    }
    // Stable interval — skip ticks while busy via ref (avoid recreating on busy).
    const id = window.setInterval(() => {
      if (busyRef.current) return;
      void dispatch(refreshGitStatus());
    }, 15000);
    return () => window.clearInterval(id);
  }, [dispatch, projectPath, collectionsMode]);

  // Auto-clear success banners; keep errors until dismissed.
  useEffect(() => {
    if (!lastSuccess) return;
    const id = window.setTimeout(() => {
      dispatch(setGitSuccess(null));
    }, 4000);
    return () => window.clearTimeout(id);
  }, [lastSuccess, dispatch]);

  if (!projectPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <FolderGit2 className="h-10 w-10 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Open a project</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Choose a folder to use as a Fishman git-native project. A{" "}
            <code className="text-xs">fishman/</code> workspace will be created
            if missing.
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={() => void dispatch(openProjectAndGitUi())}
        >
          Open Project…
        </Button>
        {lastError ? (
          <p className="max-w-md text-xs text-destructive">{lastError}</p>
        ) : null}
      </div>
    );
  }

  const hasGit = Boolean(status?.enabled);
  const hasRemote = Boolean(status?.hasRemote);
  const showDiff = Boolean(selectedDiff) && view === "changes";

  let main: ReactNode;
  if (!hasGit) {
    main = (
      <GitInitEmptyState
        busy={busy}
        onInit={() => void dispatch(initGitRepo())}
      />
    );
  } else if (showDiff) {
    main = (
      <GitDiffViewer
        diff={activeDiff}
        loading={diffLoading}
        onBack={() => void dispatch(clearGitFileDiff())}
      />
    );
  } else if (view === "commits") {
    main = <GitCommitsView />;
  } else if (view === "remotes") {
    main = hasRemote ? (
      <GitRemotesView onAddRemote={() => setAddRemoteOpen(true)} />
    ) : (
      <GitRemoteEmptyState
        onAddRemote={() => setAddRemoteOpen(true)}
        needsFirstCommit={commits.length === 0}
      />
    );
  } else if (view === "sync") {
    main = hasRemote ? (
      <GitSyncPanel />
    ) : (
      <GitRemoteEmptyState
        onAddRemote={() => setAddRemoteOpen(true)}
        needsFirstCommit={commits.length === 0}
      />
    );
  } else {
    main = (
      <GitChangesHome onAddRemote={() => setAddRemoteOpen(true)} />
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {workspaceName ?? "Project"}
            </p>
            {status?.branch ? (
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {status.branch}
                {commits.length === 0 ? " · unborn" : ""}
              </p>
            ) : null}
          </div>
        </div>

        {hasGit ? (
          <>
            <button
              type="button"
              className={cn(
                "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide",
                view === "changes"
                  ? "bg-accent/40 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40",
              )}
              onClick={() => {
                dispatch(setGitView("changes"));
                void dispatch(clearGitFileDiff());
              }}
            >
              Changes
              {(status?.changes.length ?? 0) > 0 ? (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {status?.changes.length}
                </span>
              ) : null}
            </button>
            <div className="min-h-0 flex-1 overflow-hidden">
              <GitChangesPanel />
            </div>

            <div className="shrink-0 border-t border-border">
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Links
              </p>
              <nav className="flex flex-col pb-1">
                {LINKS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                      view === id
                        ? "bg-accent/50 text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                    onClick={() => dispatch(setGitView(id))}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {id === "sync" && hasRemote && (status?.ahead || status?.behind) ? (
                      <span className="ml-auto tabular-nums text-[10px] text-muted-foreground">
                        ↑{status?.ahead ?? 0} ↓{status?.behind ?? 0}
                      </span>
                    ) : null}
                  </button>
                ))}
              </nav>
              <div className="border-t border-border p-1.5">
                <GitBranchSwitcher />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            Initialize Git to manage changes
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {(lastError || lastSuccess) && (
          <div
            className={cn(
              "flex shrink-0 items-start justify-between gap-2 border-b px-4 py-2 text-xs",
              lastError
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            )}
          >
            <p className="min-w-0 flex-1">{lastError ?? lastSuccess}</p>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
              onClick={() => {
                dispatch(setGitError(null));
                dispatch(setGitSuccess(null));
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">{main}</div>
      </section>

      <AddRemoteDialog open={addRemoteOpen} onOpenChange={setAddRemoteOpen} />
    </div>
  );
}
