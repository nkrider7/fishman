import { useMemo, useState } from "react";
import { Check, ChevronDown, Globe, Layers, Settings2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  setActiveCollectionEnvironment,
  setActiveGlobalEnvironment,
  setManagerScope,
} from "@/store/slices/environmentSlice";
import { setEnvironmentManagerOpen } from "@/store/slices/uiSlice";
import { findRootCollectionId } from "@/utils/collectionUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";

type SelectorTab = "global" | "collection";

export function EnvironmentSelector() {
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<SelectorTab>("global");
  const {
    globalEnvironments,
    collectionEnvironments,
    activeGlobalEnvironmentId,
    activeCollectionEnvironmentIds,
  } = useAppSelector((s) => s.environments);
  const folders = useAppSelector((s) => s.collections.folders);
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const drafts = useAppSelector((s) => s.request.drafts);

  const activeDraft = activeTabId ? drafts[activeTabId] : null;
  const rootCollectionId = findRootCollectionId(
    activeDraft?.collectionId,
    folders,
  );

  const collectionEnvs = rootCollectionId
    ? (collectionEnvironments[rootCollectionId] ?? [])
    : [];
  const activeCollectionEnvId = rootCollectionId
    ? (activeCollectionEnvironmentIds[rootCollectionId] ?? null)
    : null;

  const activeGlobal = globalEnvironments.find(
    (e) => e.id === activeGlobalEnvironmentId,
  );
  const activeCollection = collectionEnvs.find(
    (e) => e.id === activeCollectionEnvId,
  );

  const label = useMemo(() => {
    if (activeCollection) return activeCollection.name;
    if (activeGlobal) return activeGlobal.name;
    return "No Environment";
  }, [activeGlobal, activeCollection]);

  const hasActiveEnv = Boolean(activeCollection || activeGlobal);

  const openConfigure = () => {
    dispatch(setEnvironmentManagerOpen(true));
    dispatch(
      setManagerScope({
        scope: tab,
        collectionId: tab === "collection" ? rootCollectionId : null,
      }),
    );
  };

  const environments = tab === "global" ? globalEnvironments : collectionEnvs;
  const activeId =
    tab === "global" ? activeGlobalEnvironmentId : activeCollectionEnvId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex max-w-[220px] items-center gap-1.5 rounded px-2 py-0.5 transition-colors hover:bg-white/10",
            hasActiveEnv ? "text-amber-400" : "text-muted-foreground",
          )}
          title="Select environment"
        >
          <Globe className="h-3 w-3 shrink-0" />
          <span className="truncate text-xs font-medium">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Environment
          </p>
        </div>

        <div className="flex border-b px-1 py-1">
          <button
            type="button"
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
              tab === "global"
                ? "bg-amber-500/15 text-amber-500"
                : "text-muted-foreground hover:bg-accent",
            )}
            onClick={() => setTab("global")}
          >
            <Globe className="h-3 w-3" />
            Global
          </button>
          <button
            type="button"
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
              tab === "collection"
                ? "bg-amber-500/15 text-amber-500"
                : "text-muted-foreground hover:bg-accent",
              !rootCollectionId && "opacity-50",
            )}
            onClick={() => rootCollectionId && setTab("collection")}
            disabled={!rootCollectionId}
          >
            <Layers className="h-3 w-3" />
            Collection
          </button>
        </div>

        <div className="max-h-56 overflow-y-auto p-1">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              if (tab === "global") {
                dispatch(setActiveGlobalEnvironment(null));
              } else if (rootCollectionId) {
                dispatch(
                  setActiveCollectionEnvironment({
                    collectionId: rootCollectionId,
                    environmentId: null,
                  }),
                );
              }
            }}
          >
            <span className={cn(!activeId && "font-medium text-amber-500")}>
              No Environment
            </span>
            {!activeId && <Check className="ml-auto h-3.5 w-3.5 text-amber-500" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {environments.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              {tab === "collection" && !rootCollectionId
                ? "Open a saved request in a collection."
                : "No environments in this scope."}
            </div>
          ) : (
            environments.map((env) => (
              <DropdownMenuItem
                key={env.id}
                className="cursor-pointer"
                onClick={() => {
                  if (tab === "global") {
                    dispatch(setActiveGlobalEnvironment(env.id));
                  } else if (rootCollectionId) {
                    dispatch(
                      setActiveCollectionEnvironment({
                        collectionId: rootCollectionId,
                        environmentId: env.id,
                      }),
                    );
                  }
                }}
              >
                <span
                  className={cn(
                    activeId === env.id && "font-medium text-amber-500",
                  )}
                >
                  {env.name}
                </span>
                {activeId === env.id && (
                  <Check className="ml-auto h-3.5 w-3.5 text-amber-500" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onClick={openConfigure}>
          <Settings2 className="h-3.5 w-3.5" />
          Manage Environments
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
