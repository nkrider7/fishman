import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  fetchGitRemote,
  pullGitRemote,
  pushGitRemote,
} from "@/store/thunks/gitThunks";
import { GitBranch } from "lucide-react";

function formatFetched(ts: number | null): string {
  if (ts == null) return "Never";
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return "less than a minute ago";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

export function GitSyncPanel() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.git.status);
  const busy = useAppSelector((s) => s.git.busy);
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const upToDate = ahead === 0 && behind === 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <GitBranch className="h-6 w-6 text-primary" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        Fetch, pull, or push on{" "}
        <span className="font-mono text-foreground">
          {status?.branch ?? "HEAD"}
        </span>
        {status?.upstream ? (
          <>
            {" "}
            tracking{" "}
            <span className="font-mono text-foreground">{status.upstream}</span>
          </>
        ) : null}
        .
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy}
          onClick={() => void dispatch(fetchGitRemote())}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Fetch
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy}
          onClick={() => void dispatch(pullGitRemote())}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          Pull
          {behind > 0 ? (
            <span className="rounded bg-primary/15 px-1 text-[10px] text-primary">
              {behind}
            </span>
          ) : null}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy}
          onClick={() => void dispatch(pushGitRemote())}
        >
          <ArrowUpFromLine className="h-3.5 w-3.5" />
          Push
          {ahead > 0 ? (
            <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              {ahead}
            </span>
          ) : null}
        </Button>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Last fetched: {formatFetched(status?.lastFetchedAt ?? null)}</p>
        <p>
          <span className="text-emerald-600 dark:text-emerald-400">
            ↑ {ahead} Ahead
          </span>
          {" | "}
          <span>↓ {behind} Behind</span>
        </p>
      </div>

      {upToDate ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Your branch is up to date
        </p>
      ) : ahead > 0 ? (
        <p className="text-sm text-muted-foreground">
          {ahead} commit{ahead === 1 ? "" : "s"} ahead of remote
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {behind} commit{behind === 1 ? "" : "s"} behind remote
        </p>
      )}
    </div>
  );
}
