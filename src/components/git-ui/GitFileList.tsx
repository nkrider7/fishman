import type { GitFileChange, GitFileStatus } from "@/git-native";
import { cn } from "@/utils/cn";

function statusLetter(status: GitFileStatus): string {
  switch (status) {
    case "untracked":
      return "U";
    case "added":
      return "A";
    case "modified":
      return "M";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "conflicted":
      return "C";
    default:
      return "?";
  }
}

function statusColor(status: GitFileStatus): string {
  switch (status) {
    case "untracked":
    case "added":
      return "text-emerald-600 dark:text-emerald-400";
    case "modified":
    case "renamed":
      return "text-amber-600 dark:text-amber-400";
    case "deleted":
    case "conflicted":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

interface GitFileListProps {
  files: GitFileChange[];
  selectedPath: string | null;
  selectedStaged: boolean | null;
  onSelect: (file: GitFileChange) => void;
  onStageOne?: (path: string) => void;
  onUnstageOne?: (path: string) => void;
  mode: "staged" | "unstaged";
}

export function GitFileList({
  files,
  selectedPath,
  selectedStaged,
  onSelect,
  onStageOne,
  onUnstageOne,
  mode,
}: GitFileListProps) {
  if (files.length === 0) {
    return (
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        {mode === "staged" ? "No staged changes" : "No unstaged changes"}
      </p>
    );
  }

  const modeStaged = mode === "staged";

  return (
    <ul className="flex flex-col">
      {files.map((file) => {
        const selected =
          selectedPath === file.path && selectedStaged === modeStaged;
        return (
          <li key={`${mode}:${file.path}:${file.status}`}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/50",
                selected && "bg-accent/60",
              )}
              onClick={() => onSelect(file)}
              title={file.path}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {file.path}
              </span>
              <span
                className={cn(
                  "shrink-0 font-semibold tabular-nums",
                  statusColor(file.status),
                )}
              >
                {statusLetter(file.status)}
              </span>
              {mode === "unstaged" && onStageOne ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="shrink-0 text-[10px] text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStageOne(file.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onStageOne(file.path);
                    }
                  }}
                >
                  +
                </span>
              ) : null}
              {mode === "staged" && onUnstageOne ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="shrink-0 text-[10px] text-muted-foreground hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstageOne(file.path);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onUnstageOne(file.path);
                    }
                  }}
                >
                  −
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
