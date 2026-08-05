import { AlertTriangle } from "lucide-react";
import { useAppSelector } from "@/hooks/redux";
import { countConflictedPaths, type GitFileChange } from "@/git-native";
import { cn } from "@/utils/cn";

/** Stable empty array — `?? []` in a selector allocates every action and
 *  forces an app-wide re-render of this banner (mounted in the shell). */
const EMPTY_CHANGES: GitFileChange[] = [];

export function GitConflictBanner() {
  const changes = useAppSelector(
    (s) => s.git.status?.changes ?? EMPTY_CHANGES,
  );
  const count = countConflictedPaths(changes);
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive",
      )}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <p className="font-medium">
          {count} merge conflict{count === 1 ? "" : "s"} — resolve before
          committing
        </p>
        <p className="mt-0.5 text-[11px] text-destructive/80">
          Select a conflicted file (C) to accept ours/theirs, open the request,
          or mark resolved after editing.
        </p>
      </div>
    </div>
  );
}
