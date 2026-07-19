import { Cloud, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GitRemoteEmptyStateProps {
  onAddRemote: () => void;
  /** When true, nudge the user to commit first. */
  needsFirstCommit?: boolean;
}

export function GitRemoteEmptyState({
  onAddRemote,
  needsFirstCommit = false,
}: GitRemoteEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Cloud className="h-7 w-7 text-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Connect a remote
          </h2>
          <p className="text-sm text-muted-foreground">
            {needsFirstCommit
              ? "Make your first commit from Changes, then add a remote URL to push this project online."
              : "Paste an existing GitHub, GitLab, or other Git HTTPS URL to fetch, pull, and push."}
          </p>
        </div>
        <ol className="w-full space-y-2 text-left text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="font-mono text-xs text-foreground">1.</span>
            Stage and commit your <code className="text-[11px]">fishman/</code>{" "}
            files
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-xs text-foreground">2.</span>
            Add a remote (e.g.{" "}
            <code className="text-[11px]">https://github.com/you/repo.git</code>
            )
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-xs text-foreground">3.</span>
            Use Sync to push
          </li>
        </ol>
        <Button className="gap-2" onClick={onAddRemote}>
          <Link2 className="h-4 w-4" />
          Add Remote
        </Button>
      </div>
    </div>
  );
}
