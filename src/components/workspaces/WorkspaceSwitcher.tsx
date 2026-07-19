import { useState } from "react";
import {
  Check,
  ChevronDown,
  FolderPlus,
  ExternalLink,
  Layers,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceNameDialog } from "@/components/workspaces/WorkspaceNameDialog";
import { DeleteWorkspaceDialog } from "@/components/workspaces/DeleteWorkspaceDialog";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  switchWorkspace,
  openWorkspaceInNewWindow,
  countWorkspaceItems,
} from "@/workspaces";
import { selectActiveWorkspace } from "@/store/slices/workspaceSlice";
import { cn } from "@/utils/cn";

export function WorkspaceSwitcher() {
  const dispatch = useAppDispatch();
  const workspaces = useAppSelector((s) => s.workspaces.workspaces);
  const activeId = useAppSelector((s) => s.workspaces.activeWorkspaceId);
  const switching = useAppSelector((s) => s.workspaces.switching);
  const active = useAppSelector(selectActiveWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ collections: 0, environments: 0 });

  const target = workspaces.find((w) => w.id === targetId);

  const openRename = (id: string) => {
    setTargetId(id);
    setRenameOpen(true);
  };

  const openDelete = async (id: string) => {
    setTargetId(id);
    const next = await countWorkspaceItems(id);
    setCounts(next);
    setDeleteOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={switching}
            className={cn(
              "flex h-6 max-w-[180px] items-center gap-1.5 rounded-md px-1.5 text-xs font-medium",
              "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              "disabled:opacity-50",
            )}
            title={active?.name ? `Workspace: ${active.name}` : "Workspaces"}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-foreground/80" />
            <span className="truncate">{active?.name ?? "Workspace"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Workspaces
          </div>
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              className="flex items-center justify-between gap-2"
              onSelect={() => {
                void dispatch(switchWorkspace(ws.id));
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Layers className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{ws.name}</span>
              </span>
              {ws.id === activeId && (
                <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <FolderPlus className="h-3.5 w-3.5" />
            New Workspace
          </DropdownMenuItem>
          {active && (
            <>
              <DropdownMenuItem onSelect={() => openRename(active.id)}>
                <Pencil className="h-3.5 w-3.5" />
                Rename…
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void openWorkspaceInNewWindow(active.id);
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in New Window
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={workspaces.length <= 1}
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  void openDelete(active.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <WorkspaceNameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New Workspace"
        description="Collections and environments in this workspace stay isolated."
        confirmLabel="Create"
        onSubmit={async (name) => {
          await dispatch(createWorkspace(name)).unwrap();
        }}
      />

      <WorkspaceNameDialog
        key={target?.id ?? "rename"}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename Workspace"
        confirmLabel="Rename"
        initialName={target?.name ?? ""}
        onSubmit={async (name) => {
          if (!target) return;
          await dispatch(renameWorkspace({ id: target.id, name })).unwrap();
        }}
      />

      <DeleteWorkspaceDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        workspaceName={target?.name ?? ""}
        collectionsCount={counts.collections}
        environmentsCount={counts.environments}
        onConfirm={async () => {
          if (!target) return;
          await dispatch(deleteWorkspace(target.id)).unwrap();
        }}
      />
    </>
  );
}
