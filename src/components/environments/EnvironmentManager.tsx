import { useMemo } from "react";
import { Globe, Layers } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setManagerScope } from "@/store/slices/environmentSlice";
import type { EnvironmentScope } from "@/types/environment";
import { EnvironmentList } from "@/components/environments/EnvironmentList";
import { EnvironmentEditor } from "@/components/environments/EnvironmentEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/utils/cn";

export function EnvironmentManager() {
  const dispatch = useAppDispatch();
  const {
    globalEnvironments,
    collectionEnvironments,
    managerScope,
    managerCollectionId,
    selectedEnvironmentId,
  } = useAppSelector((s) => s.environments);
  const folders = useAppSelector((s) => s.collections.folders);

  const rootCollections = useMemo(
    () =>
      folders
        .filter((f) => !f.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [folders],
  );

  const activeCollectionId =
    managerCollectionId ?? rootCollections[0]?.id ?? null;

  const environments = useMemo(() => {
    if (managerScope === "global") return globalEnvironments;
    if (!activeCollectionId) return [];
    return collectionEnvironments[activeCollectionId] ?? [];
  }, [
    managerScope,
    globalEnvironments,
    collectionEnvironments,
    activeCollectionId,
  ]);

  const selectedEnvironment = useMemo(
    () => environments.find((e) => e.id === selectedEnvironmentId) ?? null,
    [environments, selectedEnvironmentId],
  );

  const handleScopeChange = (scope: EnvironmentScope) => {
    dispatch(
      setManagerScope({
        scope,
        collectionId: scope === "collection" ? activeCollectionId : null,
      }),
    );
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-muted/20 px-4 py-3">
        <Tabs
          value={managerScope}
          onValueChange={(v) => handleScopeChange(v as EnvironmentScope)}
        >
          <TabsList className="h-9 bg-background/80 p-1">
            <TabsTrigger
              value="global"
              className="gap-1.5 px-3 text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-500"
            >
              <Globe className="h-3.5 w-3.5" />
              Global
            </TabsTrigger>
            <TabsTrigger
              value="collection"
              className="gap-1.5 px-3 text-xs data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-500"
            >
              <Layers className="h-3.5 w-3.5" />
              Collection
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {managerScope === "collection" && (
          <Select
            value={activeCollectionId ?? ""}
            onValueChange={(id) =>
              dispatch(setManagerScope({ scope: "collection", collectionId: id }))
            }
          >
            <SelectTrigger className="h-9 w-[min(240px,40vw)] border-input/60 bg-background text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <Layers className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <SelectValue placeholder="Select collection" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {rootCollections.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  No collections yet.
                </div>
              ) : (
                rootCollections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}

        <p className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          Use {"{{variable}}"} in URLs, headers, and body fields.
        </p>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1",
          "grid-cols-1 md:grid-cols-[minmax(220px,280px)_1fr]",
        )}
      >
        <EnvironmentList
          environments={environments}
          collectionId={
            managerScope === "collection" ? activeCollectionId : null
          }
        />
        <EnvironmentEditor
          environment={selectedEnvironment}
          scope={managerScope}
          collectionId={
            managerScope === "collection" ? activeCollectionId : null
          }
        />
      </div>
    </div>
  );
}
