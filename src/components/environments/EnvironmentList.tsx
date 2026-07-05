import { Copy, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  createEnvironment,
  deleteEnvironment,
  duplicateEnvironment,
  setSelectedEnvironmentId,
} from "@/store/slices/environmentSlice";
import type { Environment } from "@/types/environment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

interface EnvironmentListProps {
  environments: Environment[];
  collectionId?: string | null;
}

export function EnvironmentList({
  environments,
  collectionId = null,
}: EnvironmentListProps) {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((s) => s.environments.selectedEnvironmentId);
  const { activeGlobalEnvironmentId, activeCollectionEnvironmentIds } =
    useAppSelector((s) => s.environments);
  const [search, setSearch] = useState("");

  const activeIdForScope = collectionId
    ? (activeCollectionEnvironmentIds[collectionId] ?? null)
    : activeGlobalEnvironmentId;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return environments;
    return environments.filter((env) => env.name.toLowerCase().includes(q));
  }, [environments, search]);

  const handleCreate = () => {
    const baseName = "New Environment";
    let name = baseName;
    let suffix = 2;
    while (environments.some((e) => e.name === name)) {
      name = `${baseName} ${suffix}`;
      suffix++;
    }
    dispatch(createEnvironment({ name, variables: [], collectionId }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-b bg-muted/10 md:border-b-0 md:border-r">
      <div className="space-y-2.5 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Environments
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
            title="New environment"
            onClick={handleCreate}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-input/60 bg-background pl-8 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-3 py-8 text-center">
            <p className="text-xs text-muted-foreground">
              {environments.length === 0
                ? "No environments yet."
                : "No matches found."}
            </p>
            {environments.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleCreate}
              >
                <Plus className="h-3.5 w-3.5" />
                Create environment
              </Button>
            )}
          </div>
        ) : (
          filtered.map((env) => {
            const isActive = activeIdForScope === env.id;
            const isSelected = selectedId === env.id;
            const varCount = env.variables.filter((v) => v.enabled && v.key).length;

            return (
              <div
                key={env.id}
                className={cn(
                  "group mb-1 flex items-stretch gap-0.5 rounded-lg border border-transparent transition-colors",
                  isSelected && "border-border/60 bg-accent/80 shadow-sm",
                  !isSelected && "hover:bg-accent/40",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left",
                    isActive && !isSelected && "border-l-2 border-amber-500",
                  )}
                  onClick={() => dispatch(setSelectedEnvironmentId(env.id))}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "break-words text-sm leading-snug",
                        isActive && "font-medium text-amber-500",
                      )}
                    >
                      {env.name}
                    </span>
                    {isActive && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-500">
                        Active
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {varCount} variable{varCount === 1 ? "" : "s"}
                  </span>
                </button>
                <div className="flex shrink-0 flex-col justify-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    title="Duplicate"
                    onClick={() => dispatch(duplicateEnvironment(env.id))}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title="Delete"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete "${env.name}"? This cannot be undone.`,
                        )
                      ) {
                        dispatch(deleteEnvironment(env.id));
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
