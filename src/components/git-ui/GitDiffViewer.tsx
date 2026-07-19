import { FileCode2 } from "lucide-react";
import type { GitFileDiff } from "@/git-native";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";

interface GitDiffViewerProps {
  diff: GitFileDiff | null;
  loading?: boolean;
  onBack: () => void;
}

function badgeClasses(badge: GitFileDiff["badge"]): string {
  switch (badge) {
    case "ADDED":
    case "UNTRACKED":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "DELETED":
      return "bg-destructive/15 text-destructive";
    case "RENAMED":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-400";
    default:
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  }
}

export function GitDiffViewer({ diff, loading, onBack }: GitDiffViewerProps) {
  if (loading && !diff) {
    return (
      <div className="flex h-full flex-col">
        <DiffChrome onBack={onBack} title="Loading…" subtitle="" />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading diff…
        </div>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex h-full flex-col">
        <DiffChrome onBack={onBack} title="Diff" subtitle="" />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Could not load this diff.
        </div>
      </div>
    );
  }

  const fileName = diff.path.split("/").pop() ?? diff.path;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DiffChrome
        onBack={onBack}
        title={fileName}
        subtitle={diff.staged ? "Staged Changes" : "Unstaged Changes"}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
              {diff.absolutePath}
            </span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide",
                badgeClasses(diff.badge),
              )}
            >
              {diff.badge === "UNTRACKED" ? "ADDED" : diff.badge}
            </span>
          </div>

          {diff.binary ? (
            <p className="p-4 text-xs text-muted-foreground">
              Binary file — contents not shown.
            </p>
          ) : diff.hunks.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No textual differences.
            </p>
          ) : (
            <div className="font-mono text-[12px] leading-5">
              {diff.hunks.map((hunk) => (
                <div key={hunk.header}>
                  <div className="bg-sky-500/10 px-3 py-1 text-[11px] text-sky-700 dark:text-sky-300">
                    {hunk.header}
                  </div>
                  {hunk.lines.map((line, i) => (
                    <div
                      key={`${hunk.header}-${i}`}
                      className={cn(
                        "flex whitespace-pre-wrap break-all border-l-2",
                        line.kind === "add" &&
                          "border-emerald-500/60 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
                        line.kind === "del" &&
                          "border-destructive/60 bg-destructive/10 text-destructive",
                        line.kind === "context" &&
                          "border-transparent text-foreground/90",
                      )}
                    >
                      <span className="w-10 shrink-0 select-none px-1 text-right text-[10px] text-muted-foreground/70">
                        {line.oldLine ?? ""}
                      </span>
                      <span className="w-10 shrink-0 select-none px-1 text-right text-[10px] text-muted-foreground/70">
                        {line.newLine ?? ""}
                      </span>
                      <span className="w-4 shrink-0 select-none text-center text-muted-foreground">
                        {line.kind === "add"
                          ? "+"
                          : line.kind === "del"
                            ? "−"
                            : " "}
                      </span>
                      <span className="min-w-0 flex-1 pr-3">{line.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffChrome({
  onBack,
  title,
  subtitle,
}: {
  onBack: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="shrink-0 space-y-1 border-b border-border px-4 py-3">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 -ml-2 px-2 text-xs text-muted-foreground"
        onClick={onBack}
      >
        ← Back to Overview
      </Button>
      <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
      {subtitle ? (
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}
