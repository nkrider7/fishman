import { useEffect, useMemo, useState } from "react";
import { Copy, GitBranch, Play, Save } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KeyValueEditor } from "@/components/common/KeyValueEditor";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { ScriptEditor } from "@/components/request/ScriptEditor";
import {
  patchSettingsDraft,
  setSettingsSubTab,
  type CollectionSettingsSubTab,
} from "@/store/slices/collectionSettingsSlice";
import { saveFolderSettings } from "@/store/thunks/collectionSettingsThunks";
import { openCollectionRunner } from "@/store/thunks/runnerThunks";
import {
  initializeCollectionGit,
  openGitUiTab,
} from "@/store/thunks/gitThunks";
import { updateTab } from "@/store/slices/tabsSlice";
import {
  HTTP_METHODS,
  type HttpMethod,
} from "@/types/request";
import type { FolderSettings, PostResponseVar } from "@/types/collection";
import { generateId } from "@/utils/id";
import { findRootCollectionId } from "@/utils/collectionUtils";
import { cn } from "@/utils/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SUB_TABS: Array<{ id: CollectionSettingsSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "headers", label: "Headers" },
  { id: "vars", label: "Vars" },
  { id: "auth", label: "Auth" },
  { id: "script", label: "Script" },
  { id: "tests", label: "Tests" },
  { id: "presets", label: "Presets" },
];

export function CollectionSettingsView() {
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.collectionSettings.draft);
  const folders = useAppSelector((s) => s.collections.folders);
  const requests = useAppSelector((s) => s.collections.requests);
  const collectionEnvs = useAppSelector(
    (s) => s.environments.collectionEnvironments,
  );
  const globalEnvs = useAppSelector((s) => s.environments.globalEnvironments);
  const theme = useAppSelector((s) => s.settings.theme);
  const monacoTheme =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "vs-dark"
      : "light";

  const folder = useMemo(
    () => folders.find((f) => f.id === draft?.folderId),
    [folders, draft?.folderId],
  );

  const requestCount = useMemo(() => {
    if (!draft) return 0;
    const scopeIds = new Set<string>();
    const walk = (id: string) => {
      scopeIds.add(id);
      for (const child of folders.filter((f) => f.parent_id === id)) {
        walk(child.id);
      }
    };
    walk(draft.folderId);
    return requests.filter(
      (r) => r.collection_id && scopeIds.has(r.collection_id),
    ).length;
  }, [draft, folders, requests]);

  useEffect(() => {
    if (!draft?.dirty || !draft.tabId) return;
    dispatch(updateTab({ id: draft.tabId, changes: { unsaved: true } }));
  }, [draft?.dirty, draft?.tabId, dispatch]);

  if (!draft) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a collection or folder to view settings.
      </div>
    );
  }

  const settings = draft.settings;
  const varsCount = settings.variables.filter((v) => v.enabled && v.key).length;
  const rootId =
    findRootCollectionId(draft.folderId, folders) ?? draft.folderId;
  const collectionEnvsCount = (collectionEnvs[rootId] ?? []).length;
  const sourceMode = useAppSelector((s) => s.collections.sourceMode);
  const gitBusy = useAppSelector((s) => s.git.busy);
  const gitStatus = useAppSelector((s) => s.git.status);
  const gitProjectPath = useAppSelector((s) => s.git.projectPath);
  const isFilesystem = sourceMode === "filesystem";
  const hasGit = Boolean(gitStatus?.enabled);
  const isRootCollection = !folder?.parent_id;

  const save = () => {
    void dispatch(saveFolderSettings());
  };

  const handleInitializeGit = () => {
    void dispatch(initializeCollectionGit(rootId));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {draft.name}
            {draft.dirty ? " *" : ""}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Collection settings
            {folder?.parent_id ? " · Folder" : " · Collection"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isRootCollection ? (
            <Button
              size="sm"
              variant={isFilesystem && hasGit ? "outline" : "default"}
              disabled={gitBusy}
              title={
                isFilesystem && hasGit
                  ? "Open Git UI"
                  : "Export this collection to a folder and initialize Git"
              }
              onClick={() => {
                if (isFilesystem && hasGit) {
                  void dispatch(openGitUiTab());
                } else {
                  handleInitializeGit();
                }
              }}
            >
              <GitBranch className="mr-1.5 h-3.5 w-3.5" />
              {isFilesystem && hasGit
                ? "Git UI"
                : "Initialize Git"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void dispatch(
                openCollectionRunner({
                  collectionId: rootId,
                  folderId: folder?.parent_id ? draft.folderId : null,
                }),
              )
            }
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Run
          </Button>
          <Button size="sm" disabled={!draft.dirty} onClick={save}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b px-3 py-1.5">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs",
              draft.activeSubTab === tab.id
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            onClick={() => dispatch(setSettingsSubTab(tab.id))}
          >
            {tab.label}
            {tab.id === "vars" && varsCount > 0 ? (
              <sup className="ml-0.5 text-[10px]">{varsCount}</sup>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {draft.activeSubTab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <OverviewRow
                label="Location"
                value={
                  isFilesystem && gitProjectPath
                    ? gitProjectPath
                    : folder?.source_kind === "filesystem" && folder.source_path
                      ? folder.source_path
                      : "Local SQLite workspace"
                }
              />
              <OverviewRow
                label="Environments"
                value={`${collectionEnvsCount} collection · ${globalEnvs.length} global`}
              />
              <OverviewRow
                label="Requests"
                value={`${requestCount} in scope`}
              />
              <OverviewRow label="Id" value={draft.folderId} copyable />

              {isRootCollection ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <GitBranch className="h-4 w-4 text-primary" />
                    Version control
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isFilesystem && hasGit
                      ? "This collection is linked to a Git project on disk. Open Git UI to commit, push, and review changes."
                      : "Export this collection into a fishman/ folder on disk and initialize a Git repository (Bruno-style)."}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={gitBusy}
                      onClick={() => {
                        if (isFilesystem && hasGit) {
                          void dispatch(openGitUiTab());
                        } else {
                          handleInitializeGit();
                        }
                      }}
                    >
                      <GitBranch className="mr-1.5 h-3.5 w-3.5" />
                      {isFilesystem && hasGit
                        ? "Open Git UI"
                        : "Initialize Git"}
                    </Button>
                    {isFilesystem && hasGit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={gitBusy}
                        onClick={() => void dispatch(openGitUiTab())}
                      >
                        View changes
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Documentation</Label>
              <Textarea
                value={settings.description}
                placeholder="Describe this collection or folder…"
                className="min-h-40"
                onChange={(e) =>
                  dispatch(patchSettingsDraft({ description: e.target.value }))
                }
              />
            </div>
          </div>
        )}

        {draft.activeSubTab === "headers" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Add request headers that will be sent with every request in this
              collection or folder (child request headers override).
            </p>
            <KeyValueEditor
              items={settings.headers}
              collectionId={draft.folderId}
              onChange={(headers) => dispatch(patchSettingsDraft({ headers }))}
            />
          </div>
        )}

        {draft.activeSubTab === "vars" && (
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Pre Request</h3>
              <p className="text-xs text-muted-foreground">
                Available as {"{{name}}"} for requests in this folder scope.
              </p>
              <KeyValueEditor
                items={settings.variables}
                collectionId={draft.folderId}
                onChange={(variables) =>
                  dispatch(patchSettingsDraft({ variables }))
                }
              />
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Post Response</h3>
              <p className="text-xs text-muted-foreground">
                Extract values from JSON responses into variables (e.g.{" "}
                <code className="rounded bg-muted px-1">$.token</code>).
              </p>
              <PostResponseVarsEditor
                items={settings.postResponseVars}
                onChange={(postResponseVars) =>
                  dispatch(patchSettingsDraft({ postResponseVars }))
                }
              />
            </section>
          </div>
        )}

        {draft.activeSubTab === "auth" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Configures authentication for this collection/folder. Requests
              using Inherit will use these settings.
            </p>
            <AuthPanel
              auth={
                settings.auth.type === "inherit"
                  ? { type: "none" }
                  : settings.auth
              }
              collectionId={draft.folderId}
              onChange={(auth) =>
                dispatch(
                  patchSettingsDraft({
                    auth: auth.type === "inherit" ? { type: "none" } : auth,
                  }),
                )
              }
              allowInherit={false}
            />
          </div>
        )}

        {draft.activeSubTab === "script" && (
          <FolderScriptPanel
            preRequest={settings.scripts.preRequest}
            postResponse={settings.scripts.postResponse}
            theme={monacoTheme}
            collectionId={draft.folderId}
            onChange={(partial) =>
              dispatch(
                patchSettingsDraft({
                  scripts: { ...settings.scripts, ...partial },
                }),
              )
            }
            onSave={save}
          />
        )}

        {draft.activeSubTab === "tests" && (
          <div className="flex h-[min(60vh,480px)] flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              These tests will run any time a request in this collection/folder
              is sent.
            </p>
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
              <ScriptEditor
                value={settings.scripts.tests}
                theme={monacoTheme}
                collectionId={draft.folderId}
                onChange={(tests) =>
                  dispatch(
                    patchSettingsDraft({
                      scripts: { ...settings.scripts, tests },
                    }),
                  )
                }
                onSave={save}
              />
            </div>
          </div>
        )}

        {draft.activeSubTab === "presets" && (
          <div className="max-w-lg space-y-4">
            <p className="text-xs text-muted-foreground">
              These presets will be used as the default values for new requests
              in this collection or folder.
            </p>
            <div className="space-y-2">
              <Label>Default method</Label>
              <Select
                value={settings.presets.defaultMethod ?? "GET"}
                onValueChange={(v) =>
                  dispatch(
                    patchSettingsDraft({
                      presets: {
                        ...settings.presets,
                        defaultMethod: v as HttpMethod,
                      },
                    }),
                  )
                }
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                placeholder="https://api.example.com"
                value={settings.presets.baseUrl ?? ""}
                onChange={(e) =>
                  dispatch(
                    patchSettingsDraft({
                      presets: {
                        ...settings.presets,
                        baseUrl: e.target.value,
                      },
                    }),
                  )
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewRow({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  return (
    <div className="rounded-md border px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-start gap-2 break-all text-sm">
        <span className="min-w-0 flex-1">{value}</span>
        {copyable && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => void navigator.clipboard.writeText(value)}
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function PostResponseVarsEditor({
  items,
  onChange,
}: {
  items: PostResponseVar[];
  onChange: (items: PostResponseVar[]) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_36px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span />
        <span>Name</span>
        <span>Expr</span>
        <span />
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.4fr)_36px] items-center gap-2"
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={item.enabled}
            onChange={(e) =>
              onChange(
                items.map((row) =>
                  row.id === item.id
                    ? { ...row, enabled: e.target.checked }
                    : row,
                ),
              )
            }
          />
          <Input
            className="h-8"
            value={item.key}
            placeholder="Name"
            onChange={(e) =>
              onChange(
                items.map((row) =>
                  row.id === item.id ? { ...row, key: e.target.value } : row,
                ),
              )
            }
          />
          <Input
            className="h-8 font-mono text-xs"
            value={item.expr}
            placeholder="$.data.token"
            onChange={(e) =>
              onChange(
                items.map((row) =>
                  row.id === item.id ? { ...row, expr: e.target.value } : row,
                ),
              )
            }
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onChange(items.filter((row) => row.id !== item.id))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...items,
            { id: generateId(), key: "", expr: "", enabled: true },
          ])
        }
      >
        Add extractor
      </Button>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">No extractors yet.</p>
      )}
    </div>
  );
}

function FolderScriptPanel({
  preRequest,
  postResponse,
  theme,
  collectionId,
  onChange,
  onSave,
}: {
  preRequest: string;
  postResponse: string;
  theme: "vs-dark" | "light";
  collectionId?: string | null;
  onChange: (
    partial: Partial<
      Pick<FolderSettings["scripts"], "preRequest" | "postResponse">
    >,
  ) => void;
  onSave: () => void;
}) {
  const [mode, setMode] = useState<"pre" | "post">("pre");

  return (
    <div className="flex h-[min(60vh,480px)] flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Write pre and post-request scripts that will run before and after any
        request in this collection/folder is sent.
      </p>
      <div className="flex w-fit gap-1 rounded-md border bg-muted/30 p-0.5">
        <button
          type="button"
          className={cn(
            "rounded px-2.5 py-1 text-xs",
            mode === "pre" ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
          onClick={() => setMode("pre")}
        >
          Pre Request
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-2.5 py-1 text-xs",
            mode === "post"
              ? "bg-background shadow-sm"
              : "text-muted-foreground",
          )}
          onClick={() => setMode("post")}
        >
          Post Response
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
        <ScriptEditor
          value={mode === "pre" ? preRequest : postResponse}
          theme={theme}
          collectionId={collectionId}
          onChange={(value) =>
            onChange(
              mode === "pre"
                ? { preRequest: value }
                : { postResponse: value },
            )
          }
          onSave={onSave}
        />
      </div>
    </div>
  );
}
