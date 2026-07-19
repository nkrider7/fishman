import { useEffect, useRef } from "react";
import { Globe2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setGitView } from "@/store/slices/gitSlice";
import {
  openGitUiTab,
  refreshGitStatus,
} from "@/store/thunks/gitThunks";
import {
  formatRemoteUrlForStatusBar,
  GitBranchSwitcher,
  pickPrimaryRemote,
} from "@/components/git-ui/GitBranchSwitcher";
import { cn } from "@/utils/cn";

/**
 * Status-bar git cluster: branch switcher + primary remote.
 * Only renders when the active workspace has an initialized git-native project.
 */
export function StatusBarGit() {
  const dispatch = useAppDispatch();
  const sourceMode = useAppSelector((s) => s.collections.sourceMode);
  const projectPath = useAppSelector((s) => s.git.projectPath);
  const status = useAppSelector((s) => s.git.status);
  const remotes = useAppSelector((s) => s.git.remotes);
  const busy = useAppSelector((s) => s.git.busy);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const isGitWorkspace =
    sourceMode === "filesystem" && Boolean(projectPath) && Boolean(status?.enabled);

  // Keep branch/remote fresh even when Git UI tab is closed.
  useEffect(() => {
    if (!isGitWorkspace || !projectPath) return;

    void dispatch(refreshGitStatus());
    const id = window.setInterval(() => {
      if (busyRef.current) return;
      void dispatch(refreshGitStatus());
    }, 20_000);
    return () => window.clearInterval(id);
  }, [dispatch, isGitWorkspace, projectPath]);

  if (!isGitWorkspace) return null;

  const primary = pickPrimaryRemote(
    status?.remotes?.length ? status.remotes : remotes,
  );
  const remoteLabel = primary
    ? formatRemoteUrlForStatusBar(primary.url)
    : null;

  const openRemotes = () => {
    void dispatch(openGitUiTab());
    dispatch(setGitView("remotes"));
  };

  return (
    <div className="flex items-center gap-0.5">
      <div className="mx-0.5 hidden h-2.5 w-px bg-border/60 sm:block" />
      <GitBranchSwitcher variant="compact" />
      {primary && remoteLabel ? (
        <button
          type="button"
          onClick={openRemotes}
          title={`${primary.name}: ${primary.url}\nOpen Remotes in Git UI`}
          className={cn(
            "flex h-4 max-w-[220px] items-center gap-0.5 rounded px-1 text-[10px] leading-none",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          )}
        >
          <Globe2 className="h-2.5 w-2.5 shrink-0" />
          <span className="shrink-0 font-medium opacity-70">{primary.name}</span>
          <span className="truncate">{remoteLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
