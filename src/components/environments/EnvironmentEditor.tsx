import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Zap } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  clearLiveEnvironmentVariables,
  createEnvironment,
  setActiveCollectionEnvironment,
  setActiveGlobalEnvironment,
  setEnvironmentDirty,
  setLiveEnvironmentVariables,
  updateEnvironment,
} from "@/store/slices/environmentSlice";
import type { Environment, EnvironmentScope } from "@/types/environment";
import type { KeyValue } from "@/types/request";
import { EnvironmentVariablesEditor } from "@/components/environments/EnvironmentVariablesEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

interface EnvironmentEditorProps {
  environment: Environment | null;
  scope?: EnvironmentScope;
  collectionId?: string | null;
}

export function EnvironmentEditor({
  environment,
  scope = "global",
  collectionId = null,
}: EnvironmentEditorProps) {
  const dispatch = useAppDispatch();
  const {
    activeGlobalEnvironmentId,
    activeCollectionEnvironmentIds,
    liveVariablesByEnvId,
    globalEnvironments,
    collectionEnvironments,
  } = useAppSelector((s) => s.environments);
  const [name, setName] = useState("");
  const [variables, setVariables] = useState<KeyValue[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [saving, setSaving] = useState(false);

  const isActive = useMemo(() => {
    if (!environment) return false;
    if (environment.collection_id) {
      return (
        activeCollectionEnvironmentIds[environment.collection_id] ===
        environment.id
      );
    }
    return activeGlobalEnvironmentId === environment.id;
  }, [
    environment,
    activeGlobalEnvironmentId,
    activeCollectionEnvironmentIds,
  ]);

  useEffect(() => {
    if (!environment) {
      setName("");
      setVariables([]);
      setRenaming(false);
      return;
    }
    setName(environment.name);
    setVariables(
      liveVariablesByEnvId[environment.id] ?? environment.variables,
    );
    setRenaming(false);
    dispatch(setEnvironmentDirty(false));
  }, [environment?.id, dispatch]);

  const isDirty = useMemo(() => {
    if (!environment) return false;
    if (name !== environment.name) return true;
    return JSON.stringify(variables) !== JSON.stringify(environment.variables);
  }, [environment, name, variables]);

  useEffect(() => {
    dispatch(setEnvironmentDirty(isDirty));
  }, [isDirty, dispatch]);

  const handleVariablesChange = useCallback(
    (next: KeyValue[]) => {
      setVariables(next);
      if (environment) {
        dispatch(
          setLiveEnvironmentVariables({
            envId: environment.id,
            variables: next,
          }),
        );
      }
    },
    [dispatch, environment],
  );

  const handleSave = async () => {
    if (!environment || !name.trim()) return;
    setSaving(true);
    try {
      await dispatch(
        updateEnvironment({
          id: environment.id,
          name: name.trim(),
          variables,
        }),
      ).unwrap();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!environment) return;
    setName(environment.name);
    setVariables(environment.variables);
    dispatch(clearLiveEnvironmentVariables(environment.id));
    dispatch(setEnvironmentDirty(false));
  };

  const handleSetActive = () => {
    if (!environment) return;
    if (environment.collection_id) {
      dispatch(
        setActiveCollectionEnvironment({
          collectionId: environment.collection_id,
          environmentId: environment.id,
        }),
      );
    } else {
      dispatch(setActiveGlobalEnvironment(environment.id));
    }
  };

  const handleCreate = () => {
    const baseName = "New Environment";
    let envName = baseName;
    let suffix = 2;
    const existing =
      collectionId != null
        ? (collectionEnvironments[collectionId] ?? [])
        : globalEnvironments;
    while (existing.some((e) => e.name === envName)) {
      envName = `${baseName} ${suffix}`;
      suffix++;
    }
    dispatch(createEnvironment({ name: envName, variables: [], collectionId }));
  };

  if (!environment) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="rounded-full bg-muted/60 p-3">
          <Zap className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Select an environment
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Pick one from the list or create a new environment to edit variables.
            Changes preview live in requests before saving.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={handleCreate}
        >
          <Plus className="h-3.5 w-3.5" />
          Create environment
        </Button>
      </div>
    );
  }

  const hasLivePreview = Boolean(liveVariablesByEnvId[environment.id]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/10 px-4 py-3">
        {renaming ? (
          <Input
            className="h-8 max-w-[240px] text-sm"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setRenaming(false);
              if (e.key === "Escape") {
                setName(environment.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold">{name}</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              title="Rename"
              onClick={() => setRenaming(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 border-0 text-[10px] font-semibold uppercase",
            scope === "collection"
              ? "bg-amber-500/15 text-amber-500"
              : "bg-sky-500/15 text-sky-500",
          )}
        >
          {scope}
        </Badge>
        {isActive ? (
          <Badge
            variant="outline"
            className="shrink-0 border-0 bg-green-500/15 text-[10px] font-semibold uppercase text-green-500"
          >
            Active
          </Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSetActive}
          >
            Set as active
          </Button>
        )}
        {hasLivePreview && isActive && (
          <span className="ml-auto text-[10px] font-medium text-amber-500">
            Live preview
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <EnvironmentVariablesEditor
          items={variables}
          onChange={handleVariablesChange}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t bg-muted/10 px-4 py-3">
        <Button
          size="sm"
          className="bg-amber-600 hover:bg-amber-600/90"
          onClick={handleSave}
          disabled={!isDirty || saving || !name.trim()}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReset}
          disabled={!isDirty}
        >
          Reset
        </Button>
        {isDirty && (
          <span className="text-xs text-amber-500">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
