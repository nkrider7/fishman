import { useMemo, useState } from "react";
import { GitBranch, GitCommitHorizontal } from "lucide-react";
import { useAppSelector } from "@/hooks/redux";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import type { GitCommitInfo } from "@/git-native";

type BranchFilter = "all" | "current" | string;

function formatRelativeTime(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 14) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CommitRow({
  commit,
  currentBranch,
}: {
  commit: GitCommitInfo;
  currentBranch: string | null;
}) {
  const subject = commit.message.trim().split("\n")[0] || "(empty message)";
  const branches = commit.branches ?? [];
  const tips = commit.tips ?? [];

  return (
    <li className="group relative px-4 py-3 transition-colors hover:bg-muted/40">
      <div className="flex gap-3">
        <div className="flex w-5 shrink-0 flex-col items-center pt-0.5">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border bg-background",
              tips.length > 0
                ? "border-primary/50 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            <GitCommitHorizontal className="h-3 w-3" />
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium leading-snug text-foreground">
            {subject}
          </p>

          {(branches.length > 0 || tips.length > 0) && (
            <div className="flex flex-wrap items-center gap-1">
              {tips.map((b) => (
                <Badge
                  key={`tip:${b}`}
                  variant={b === currentBranch ? "default" : "secondary"}
                  className="h-5 gap-1 px-1.5 text-[10px] font-medium"
                  title={`Tip of ${b}`}
                >
                  <GitBranch className="h-2.5 w-2.5" />
                  {b}
                  {b === currentBranch ? " · HEAD" : " · tip"}
                </Badge>
              ))}
              {branches
                .filter((b) => !tips.includes(b))
                .map((b) => (
                  <Badge
                    key={`br:${b}`}
                    variant="outline"
                    className={cn(
                      "h-5 gap-1 px-1.5 text-[10px] font-normal",
                      b === currentBranch &&
                        "border-primary/40 text-primary",
                    )}
                    title={`On branch ${b}`}
                  >
                    <GitBranch className="h-2.5 w-2.5 opacity-70" />
                    {b}
                  </Badge>
                ))}
            </div>
          )}

          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground/80">
              {commit.oid.slice(0, 7)}
            </span>
            <span aria-hidden>·</span>
            <span>{commit.author}</span>
            <span aria-hidden>·</span>
            <span title={new Date(commit.timestamp).toLocaleString()}>
              {formatRelativeTime(commit.timestamp)}
            </span>
          </p>
        </div>
      </div>
    </li>
  );
}

export function GitCommitsView() {
  const commits = useAppSelector((s) => s.git.commits);
  const branches = useAppSelector((s) => s.git.branches);
  const status = useAppSelector((s) => s.git.status);
  const currentBranch = status?.branch ?? null;

  const [filter, setFilter] = useState<BranchFilter>("all");

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    if (currentBranch) set.add(currentBranch);
    for (const b of branches) if (b) set.add(b);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [branches, currentBranch]);

  const filtered = useMemo(() => {
    if (filter === "all") return commits;
    const branch =
      filter === "current" ? currentBranch : filter;
    if (!branch) return commits;
    return commits.filter((c) => (c.branches ?? []).includes(branch));
  }, [commits, filter, currentBranch]);

  if (commits.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <GitCommitHorizontal className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No commits yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Stage files in Changes and commit — history will show up here with
          branch labels.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">Commits</h3>
          <p className="text-[11px] text-muted-foreground">
            {filtered.length} shown
            {filter === "all"
              ? " · all branches"
              : ` · on ${filter === "current" ? currentBranch : filter}`}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="sr-only">Filter by branch</span>
          <GitBranch className="h-3 w-3 shrink-0" />
          <select
            className="h-7 max-w-[160px] rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={filter === "current" && currentBranch ? currentBranch : filter}
            onChange={(e) => {
              const v = e.target.value;
              setFilter(v === "all" ? "all" : v);
            }}
            aria-label="Filter commits by branch"
          >
            <option value="all">All branches</option>
            {branchOptions.map((b) => (
              <option key={b} value={b}>
                {b === currentBranch ? `${b} (current)` : b}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          No commits on this branch filter.
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto">
          {filtered.map((c) => (
            <CommitRow
              key={c.oid}
              commit={c}
              currentBranch={currentBranch}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
