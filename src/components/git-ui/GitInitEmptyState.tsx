import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GitInitEmptyStateProps {
  busy?: boolean;
  onInit: () => void;
}

export function GitInitEmptyState({ busy, onInit }: GitInitEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card px-8 py-10 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <GitBranch className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            Initialize Git Repository
          </h2>
          <p className="text-sm text-muted-foreground">
            Start tracking your changes with Git. Initialize a new repository to
            enable version control for this project.
          </p>
        </div>
        <Button
          className="mt-2 gap-2"
          disabled={busy}
          onClick={onInit}
        >
          <GitBranch className="h-4 w-4" />
          Initialize Git
        </Button>
      </div>
    </div>
  );
}
