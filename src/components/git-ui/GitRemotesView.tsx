import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { removeGitRemote } from "@/store/thunks/gitThunks";

interface GitRemotesViewProps {
  onAddRemote: () => void;
}

export function GitRemotesView({ onAddRemote }: GitRemotesViewProps) {
  const dispatch = useAppDispatch();
  const remotes = useAppSelector((s) => s.git.remotes);
  const busy = useAppSelector((s) => s.git.busy);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-sm font-medium">Remotes</h3>
        <Button size="sm" variant="outline" onClick={onAddRemote}>
          Add Remote
        </Button>
      </div>
      {remotes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
          No remotes configured.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-auto">
          {remotes.map((r) => (
            <li
              key={r.name}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {r.url}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={busy}
                title={`Remove ${r.name}`}
                onClick={() => {
                  const ok = window.confirm(`Remove remote "${r.name}"?`);
                  if (ok) void dispatch(removeGitRemote(r.name));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
