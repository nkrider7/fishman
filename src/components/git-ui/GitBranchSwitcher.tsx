import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  GitBranch,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { checkoutGitBranch, createGitBranch } from "@/store/thunks/gitThunks";
import { cn } from "@/utils/cn";

export type GitBranchSwitcherVariant = "default" | "compact";

interface GitBranchSwitcherProps {
  /** `compact` fits the app status bar; default is the Git UI sidebar control. */
  variant?: GitBranchSwitcherVariant;
  className?: string;
}

export function GitBranchSwitcher({
  variant = "default",
  className,
}: GitBranchSwitcherProps) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.git.status);
  const branches = useAppSelector((s) => s.git.branches);
  const commits = useAppSelector((s) => s.git.commits);
  const busy = useAppSelector((s) => s.git.busy);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  const current = status?.branch?.trim() || null;
  const unborn = Boolean(current) && commits.length === 0;
  const compact = variant === "compact";

  const branchList = useMemo(() => {
    const set = new Set<string>();
    if (current && current !== "HEAD") set.add(current);
    for (const b of branches) {
      if (b?.trim()) set.add(b.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [branches, current]);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void dispatch(createGitBranch(trimmed));
    setName("");
    setCreateOpen(false);
  };

  const label = current ?? "No branch";
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <button
              type="button"
              disabled={busy || !status?.enabled}
              title={
                unborn
                  ? `${label} (no commits yet)`
                  : ahead || behind
                    ? `${label} · ↑${ahead} ↓${behind}`
                    : `Branch: ${label}`
              }
              className={cn(
                "flex h-4 max-w-[140px] items-center gap-0.5 rounded px-1 text-[10px] leading-none",
                "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                "disabled:cursor-default disabled:opacity-40",
                className,
              )}
            >
              <GitBranch className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate font-medium">{label}</span>
              {(ahead > 0 || behind > 0) && (
                <span className="flex shrink-0 items-center gap-0.5 tabular-nums text-[9px] opacity-80">
                  {ahead > 0 ? (
                    <span className="inline-flex items-center">
                      <ArrowUp className="h-2 w-2" />
                      {ahead}
                    </span>
                  ) : null}
                  {behind > 0 ? (
                    <span className="inline-flex items-center">
                      <ArrowDown className="h-2 w-2" />
                      {behind}
                    </span>
                  ) : null}
                </span>
              )}
              <ChevronsUpDown className="h-2 w-2 shrink-0 opacity-60" />
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-full justify-between gap-1 px-2 text-xs",
                className,
              )}
              disabled={busy || !status?.enabled}
              title={unborn ? `${label} (no commits yet)` : label}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">{label}</span>
              </span>
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side={compact ? "top" : "bottom"}
          className="w-56"
        >
          {unborn ? (
            <p className="px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
              No commits yet — creating a branch only renames HEAD. Commit
              first so branches are kept separately.
            </p>
          ) : (
            <p className="px-2 py-1 text-[10px] text-muted-foreground">
              {branchList.length} local branch
              {branchList.length === 1 ? "" : "es"}
            </p>
          )}
          {branchList.length === 0 ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              No branches yet
            </DropdownMenuItem>
          ) : (
            branchList.map((b) => (
              <DropdownMenuItem
                key={b}
                className="font-mono text-xs"
                onClick={() => {
                  if (b !== current) void dispatch(checkoutGitBranch(b));
                }}
              >
                {b === current ? `✓ ${b}` : b}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create branch…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {unborn ? "Rename branch" : "Create branch"}
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="feature/my-branch"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {unborn
              ? "This repo has no commits yet. This renames the current branch — previous names are not kept until you commit."
              : "Creates a new branch from your current commit and switches to it. Your previous branch stays in the list."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || busy}>
              {unborn ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Prefer origin, otherwise the first configured remote. */
export function pickPrimaryRemote(
  remotes: { name: string; url: string }[] | undefined,
): { name: string; url: string } | null {
  if (!remotes?.length) return null;
  return remotes.find((r) => r.name === "origin") ?? remotes[0] ?? null;
}

/** Shorten a git remote URL for the status bar. */
export function formatRemoteUrlForStatusBar(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  const ssh = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (ssh) {
    const host = ssh[1]!;
    const path = ssh[2]!.replace(/\.git$/i, "");
    return `${host}/${path}`;
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/^\//, "").replace(/\.git$/i, "");
    return path ? `${parsed.host}/${path}` : parsed.host;
  } catch {
    return trimmed.replace(/\.git$/i, "");
  }
}
