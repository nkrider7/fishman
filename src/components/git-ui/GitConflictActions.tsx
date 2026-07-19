import { Check, FileCode2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  markGitConflictResolved,
  openConflictFishRequest,
  resolveGitConflict,
} from "@/store/thunks/gitConflictThunks";

interface GitConflictActionsProps {
  path: string;
}

export function GitConflictActions({ path }: GitConflictActionsProps) {
  const dispatch = useAppDispatch();
  const busy = useAppSelector((s) => s.git.busy);
  const isFish = path.endsWith(".fish");

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-destructive/5 px-3 py-2">
      <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-destructive">
        Conflict
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        disabled={busy}
        onClick={() => void dispatch(resolveGitConflict({ path, side: "ours" }))}
        title="Keep our version (HEAD)"
      >
        <GitBranch className="h-3 w-3" />
        Accept ours
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        disabled={busy}
        onClick={() =>
          void dispatch(resolveGitConflict({ path, side: "theirs" }))
        }
        title="Keep their version (MERGE_HEAD)"
      >
        <GitBranch className="h-3 w-3" />
        Accept theirs
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        disabled={busy}
        onClick={() => void dispatch(markGitConflictResolved(path))}
        title="Stage as resolved after you edited the file"
      >
        <Check className="h-3 w-3" />
        Mark resolved
      </Button>
      {isFish ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-[11px]"
          disabled={busy}
          onClick={() => void dispatch(openConflictFishRequest(path))}
        >
          <FileCode2 className="h-3 w-3" />
          Open in Fishman
        </Button>
      ) : null}
    </div>
  );
}
