import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Loader2,
  Replace,
  ReplaceAll,
  Undo2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { clearUrlReplacePrefill } from "@/store/slices/uiSlice";
import {
  applyUrlReplaceMatches,
  undoUrlReplace,
} from "@/store/thunks/urlReplaceThunks";
import {
  buildUrlReplaceMatches,
  detectBases,
  groupMatchesByField,
  remapMatchReplace,
  summarizeMatches,
  undoDepth,
  DEFAULT_URL_REPLACE_OPTIONS,
  type UrlReplaceField,
  type UrlReplaceMatch,
  type UrlReplaceOptions,
  type UrlReplaceScope,
  type UrlReplaceScopeKind,
} from "@/url-replace";
import { findRootCollectionId } from "@/utils/collectionUtils";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CONFIRM_THRESHOLD = 50;
const FIND_DEBOUNCE_MS = 160;
const REPLACE_DEBOUNCE_MS = 60;

type FlatRow =
  | { type: "header"; field: UrlReplaceField; label: string; count: number }
  | { type: "match"; match: UrlReplaceMatch };

/**
 * VS Code–style Search / Replace panel (sidebar).
 * Searches URL, Params, and Body — grouped like files in VS Code.
 */
export function UrlReplaceSidebarPanel() {
  const dispatch = useAppDispatch();
  const seedScope = useAppSelector((s) => s.ui.urlReplaceScope);
  const findPrefill = useAppSelector((s) => s.ui.urlReplaceFindPrefill);
  const prefillSeq = useAppSelector((s) => s.ui.urlReplacePrefillSeq);
  const folders = useAppSelector((s) => s.collections.folders);
  const requests = useAppSelector((s) => s.collections.requests);
  const globalEnvironments = useAppSelector(
    (s) => s.environments.globalEnvironments,
  );
  const collectionEnvironments = useAppSelector(
    (s) => s.environments.collectionEnvironments,
  );
  const tabs = useAppSelector((s) => s.tabs.tabs);
  const activeCollectionId = useAppSelector((s) => {
    const id = s.tabs.activeTabId;
    if (!id) return null;
    return s.request.drafts[id]?.collectionId ?? null;
  });

  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [debouncedFind, setDebouncedFind] = useState("");
  const [debouncedReplace, setDebouncedReplace] = useState("");
  const [replaceExpanded, setReplaceExpanded] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [options, setOptions] = useState<UrlReplaceOptions>({
    ...DEFAULT_URL_REPLACE_OPTIONS,
  });

  const drafts = useAppSelector((s) =>
    options.includeOpenTabs ? s.request.drafts : EMPTY_DRAFTS,
  );

  const environments = useMemo(() => {
    if (!options.includeEnvironmentVariables) return EMPTY_ENVS;
    const list = [...globalEnvironments];
    for (const envs of Object.values(collectionEnvironments)) {
      list.push(...envs);
    }
    return list;
  }, [
    options.includeEnvironmentVariables,
    globalEnvironments,
    collectionEnvironments,
  ]);

  const rootCollections = useMemo(
    () => folders.filter((f) => !f.parent_id),
    [folders],
  );

  const defaultCollectionId = useMemo(() => {
    if (seedScope?.folderId) {
      return (
        findRootCollectionId(seedScope.folderId, folders) ?? seedScope.folderId
      );
    }
    if (activeCollectionId) {
      return (
        findRootCollectionId(activeCollectionId, folders) ?? activeCollectionId
      );
    }
    return rootCollections[0]?.id ?? null;
  }, [seedScope, folders, activeCollectionId, rootCollections]);

  const [scopeKind, setScopeKind] = useState<UrlReplaceScopeKind>(
    seedScope?.kind ?? (defaultCollectionId ? "collection" : "workspace"),
  );
  const [scopeFolderId, setScopeFolderId] = useState<string | null>(
    seedScope?.folderId ?? defaultCollectionId,
  );

  const [baseMatches, setBaseMatches] = useState<UrlReplaceMatch[]>([]);
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<UrlReplaceField>>(
    () => new Set(),
  );
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [canUndo, setCanUndo] = useState(() => undoDepth() > 0);
  const scanGen = useRef(0);

  useEffect(() => {
    if (!findPrefill) return;
    setFind(findPrefill);
    setDebouncedFind(findPrefill);
    setReplaceExpanded(true);
    // If prefill looks like a host, enable origin mode for URLs
    if (/^https?:\/\//i.test(findPrefill.trim())) {
      setOptions((o) => ({ ...o, wholeOrigin: true, mode: "origin" }));
    } else {
      setOptions((o) => ({ ...o, wholeOrigin: false, mode: "literal" }));
    }
    dispatch(clearUrlReplacePrefill());
    const t = window.setTimeout(() => {
      replaceInputRef.current?.focus();
      replaceInputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, [prefillSeq, findPrefill, dispatch]);

  useEffect(() => {
    if (findPrefill) return;
    const t = window.setTimeout(() => findInputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seedScope?.kind) setScopeKind(seedScope.kind);
    if (seedScope?.folderId) setScopeFolderId(seedScope.folderId);
  }, [seedScope]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedFind(find), FIND_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [find]);

  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedReplace(replace),
      REPLACE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [replace]);

  const tabMeta = useMemo(
    () =>
      tabs.map((t) => ({
        id: t.id,
        title: t.title,
        requestId: t.requestId,
        kind: t.kind,
      })),
    [tabs],
  );

  const scope: UrlReplaceScope = useMemo(() => {
    if (scopeKind === "selected") {
      return { kind: "selected", requestIds: seedScope?.requestIds ?? [] };
    }
    if (scopeKind === "collection" || scopeKind === "folder") {
      return { kind: scopeKind, folderId: scopeFolderId };
    }
    return { kind: scopeKind };
  }, [scopeKind, scopeFolderId, seedScope?.requestIds]);

  const detected = useMemo(() => {
    if (!showSuggestions) return [];
    return detectBases(
      requests.map((r) => r.url),
      { limit: 5 },
    );
  }, [requests, showSuggestions]);

  useEffect(() => {
    const findTrim = debouncedFind.trim();
    if (!findTrim) {
      setBaseMatches([]);
      setScanning(false);
      return;
    }

    const gen = ++scanGen.current;
    setScanning(true);

    const run = () => {
      if (gen !== scanGen.current) return;
      const scanned = buildUrlReplaceMatches(findTrim, "", scope, options, {
        folders,
        requests,
        environments,
        openDrafts: drafts,
        tabs: tabMeta,
      });
      if (gen !== scanGen.current) return;
      startTransition(() => {
        setBaseMatches(scanned);
        setDeselectedIds(new Set());
        setScanning(false);
      });
    };

    const t = window.setTimeout(run, 0);
    return () => window.clearTimeout(t);
  }, [
    debouncedFind,
    scope,
    options,
    folders,
    requests,
    environments,
    drafts,
    tabMeta,
  ]);

  const matches = useMemo(() => {
    const remapped = remapMatchReplace(
      baseMatches,
      debouncedFind,
      debouncedReplace,
      {
        matchCase: options.matchCase,
        wholeOrigin: options.wholeOrigin,
      },
    );
    if (deselectedIds.size === 0) return remapped;
    return remapped.map((m) =>
      deselectedIds.has(m.id) ? { ...m, selected: false } : m,
    );
  }, [
    baseMatches,
    debouncedFind,
    debouncedReplace,
    options.matchCase,
    options.wholeOrigin,
    deselectedIds,
  ]);

  const flatRows: FlatRow[] = useMemo(() => {
    const groups = groupMatchesByField(matches);
    const rows: FlatRow[] = [];
    for (const g of groups) {
      rows.push({
        type: "header",
        field: g.field,
        label: g.label,
        count: g.matches.length,
      });
      if (!collapsedGroups.has(g.field)) {
        for (const m of g.matches) {
          rows.push({ type: "match", match: m });
        }
      }
    }
    return rows;
  }, [matches, collapsedGroups]);

  const summary = useMemo(() => summarizeMatches(matches), [matches]);
  const showDiff = Boolean(debouncedReplace.trim());

  const toggleMatch = useCallback((id: string, selected: boolean) => {
    setDeselectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (selected: boolean) => {
      if (selected) setDeselectedIds(new Set());
      else setDeselectedIds(new Set(baseMatches.map((m) => m.id)));
    },
    [baseMatches],
  );

  const validationError = useMemo(() => {
    if (!find.trim()) return null;
    if (!replace.trim()) return "Enter a replace value.";
    if (find.trim() === replace.trim()) return "Find and replace are the same.";
    if (options.wholeOrigin && options.includeUrl) {
      const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(find.trim());
      if (looksLikeUrl) {
        try {
          // eslint-disable-next-line no-new
          new URL(find.trim().replace(/\/+$/, ""));
        } catch {
          return "Origin mode needs a full URL like http://localhost:3000.";
        }
      }
    }
    return null;
  }, [find, replace, options.wholeOrigin, options.includeUrl]);

  const runApply = async (onlySelected: boolean) => {
    setError(null);
    setStatus(null);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!find.trim() || !replace.trim()) {
      setError("Enter find and replace values.");
      return;
    }

    const payloadSource = remapMatchReplace(baseMatches, find, replace, {
      matchCase: options.matchCase,
      wholeOrigin: options.wholeOrigin,
    }).map((m) => ({
      ...m,
      selected: onlySelected ? !deselectedIds.has(m.id) : true,
    }));

    const count = payloadSource.filter(
      (m) => m.selected && m.before !== m.after,
    ).length;
    if (count === 0) {
      setError("No matches selected to replace.");
      return;
    }
    const touchesFs = payloadSource.some((m) => m.selected && m.filesystem);
    if (count >= CONFIRM_THRESHOLD || touchesFs) {
      const ok = window.confirm(
        `Replace ${count} match${count === 1 ? "" : "es"}?`,
      );
      if (!ok) return;
    }

    setApplying(true);
    try {
      const result = await dispatch(
        applyUrlReplaceMatches({ matches: payloadSource }),
      ).unwrap();
      setCanUndo(undoDepth() > 0);
      if (result.errors.length > 0) {
        setError(result.errors.slice(0, 2).join(" · "));
      }
      setStatus(
        result.applied > 0
          ? `Replaced in ${result.applied} item${result.applied === 1 ? "" : "s"}`
          : "Nothing replaced.",
      );
      const scanned = buildUrlReplaceMatches(find.trim(), "", scope, options, {
        folders,
        requests,
        environments,
        openDrafts: drafts,
        tabs: tabMeta,
      });
      setBaseMatches(scanned);
      setDeselectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const runUndo = async () => {
    setError(null);
    setApplying(true);
    try {
      const result = await dispatch(undoUrlReplace()).unwrap();
      setCanUndo(undoDepth() > 0);
      setStatus(
        result.applied > 0
          ? `Undid ${result.applied}`
          : result.errors[0] ?? "Nothing to undo.",
      );
      const scanned = buildUrlReplaceMatches(find.trim(), "", scope, options, {
        folders,
        requests,
        environments,
        openDrafts: drafts,
        tabs: tabMeta,
      });
      setBaseMatches(scanned);
      setDeselectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Search
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Undo last replace"
          disabled={!canUndo || applying}
          onClick={() => void runUndo()}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="shrink-0 space-y-1.5 border-b border-border/60 px-2 py-2">
        <div className="flex items-start gap-0.5">
          <button
            type="button"
            className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            title={replaceExpanded ? "Hide Replace" : "Show Replace"}
            onClick={() => setReplaceExpanded((v) => !v)}
          >
            {replaceExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-0.5 rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
              <input
                ref={findInputRef}
                value={find}
                onChange={(e) => setFind(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setReplaceExpanded(true);
                    replaceInputRef.current?.focus();
                  }
                }}
                placeholder="Search"
                className="h-7 min-w-0 flex-1 bg-transparent px-2 font-mono text-xs outline-none placeholder:text-muted-foreground"
                spellCheck={false}
                autoComplete="off"
              />
              <ToggleIcon
                active={options.matchCase}
                title="Match Case"
                onClick={() =>
                  setOptions((o) => ({ ...o, matchCase: !o.matchCase }))
                }
              >
                <CaseSensitive className="h-3.5 w-3.5" />
              </ToggleIcon>
              <ToggleIcon
                active={options.wholeOrigin}
                title="Whole origin for URLs (scheme://host[:port])"
                onClick={() =>
                  setOptions((o) => ({
                    ...o,
                    wholeOrigin: !o.wholeOrigin,
                    mode: !o.wholeOrigin ? "origin" : "literal",
                  }))
                }
              >
                <span className="px-0.5 font-mono text-[9px] font-semibold">
                  ://
                </span>
              </ToggleIcon>
              <ToggleIcon
                active={showSuggestions}
                title="Suggest common hosts"
                onClick={() => setShowSuggestions((v) => !v)}
              >
                <Lightbulb className="h-3.5 w-3.5" />
              </ToggleIcon>
            </div>
          </div>
        </div>

        {replaceExpanded && (
          <div className="flex items-start gap-0.5">
            <div className="w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-0.5 rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
                <input
                  ref={replaceInputRef}
                  value={replace}
                  onChange={(e) => setReplace(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      void runApply(false);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      void runApply(true);
                    }
                  }}
                  placeholder="Replace"
                  className="h-7 min-w-0 flex-1 bg-transparent px-2 font-mono text-xs outline-none placeholder:text-muted-foreground"
                  spellCheck={false}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="Replace selected (Enter)"
                  disabled={
                    applying || !!validationError || summary.selected === 0
                  }
                  onClick={() => void runApply(true)}
                >
                  <Replace className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="Replace all (Ctrl+Enter)"
                  disabled={
                    applying || !!validationError || summary.total === 0
                  }
                  onClick={() => void runApply(false)}
                >
                  <ReplaceAll className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {showSuggestions && detected.length > 0 && (
          <div className="flex flex-wrap gap-1 pl-5">
            {detected.map((b) => (
              <button
                key={b.origin}
                type="button"
                className={cn(
                  "max-w-full truncate rounded-sm border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]",
                  "text-muted-foreground hover:bg-accent hover:text-foreground",
                  find.trim() === b.origin &&
                    "border-primary/40 bg-primary/10 text-foreground",
                )}
                onClick={() => {
                  setFind(b.origin);
                  setDebouncedFind(b.origin);
                  setOptions((o) => ({
                    ...o,
                    wholeOrigin: true,
                    mode: "origin",
                  }));
                  setShowSuggestions(false);
                }}
              >
                {b.origin}
                <span className="opacity-50"> ({b.count})</span>
              </button>
            ))}
          </div>
        )}
        {showSuggestions && detected.length === 0 && (
          <p className="pl-5 text-[10px] text-muted-foreground">
            No common hosts detected in this workspace.
          </p>
        )}

        <div className="pl-5">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setOptionsOpen((v) => !v)}
          >
            {optionsOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            files to include
          </button>
          {optionsOpen && (
            <div className="mt-1.5 space-y-2 rounded-md border border-border/50 bg-muted/20 p-2">
              <Select
                value={scopeKind}
                onValueChange={(v) => setScopeKind(v as UrlReplaceScopeKind)}
              >
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="collection">Current collection</SelectItem>
                  <SelectItem value="folder">Folder (recursive)</SelectItem>
                  <SelectItem value="workspace">Entire workspace</SelectItem>
                  <SelectItem value="open-tabs">Open tabs only</SelectItem>
                </SelectContent>
              </Select>
              {(scopeKind === "collection" || scopeKind === "folder") && (
                <Select
                  value={scopeFolderId ?? undefined}
                  onValueChange={setScopeFolderId}
                >
                  <SelectTrigger className="h-7 text-[11px]">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(scopeKind === "collection"
                      ? rootCollections
                      : folders
                    ).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-center gap-2 text-[11px]">
                <Checkbox
                  checked={options.includeUrl}
                  onCheckedChange={(v) =>
                    setOptions((o) => ({ ...o, includeUrl: v === true }))
                  }
                />
                URL
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <Checkbox
                  checked={options.includeParams}
                  onCheckedChange={(v) =>
                    setOptions((o) => ({ ...o, includeParams: v === true }))
                  }
                />
                Params
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <Checkbox
                  checked={options.includeBody}
                  onCheckedChange={(v) =>
                    setOptions((o) => ({ ...o, includeBody: v === true }))
                  }
                />
                Body
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <Checkbox
                  checked={options.includeOpenTabs}
                  onCheckedChange={(v) =>
                    setOptions((o) => ({ ...o, includeOpenTabs: v === true }))
                  }
                />
                Open tabs
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5 truncate">
          {scanning && <Loader2 className="h-3 w-3 animate-spin" />}
          {!find.trim()
            ? "Type to search URL, Params, Body"
            : `${summary.total} result${summary.total === 1 ? "" : "s"} · ${summary.selected} selected`}
          {summary.total > 0 && (
            <span className="opacity-70">
              {summary.urls > 0 && ` · ${summary.urls} url`}
              {summary.params > 0 && ` · ${summary.params} param`}
              {summary.bodies > 0 && ` · ${summary.bodies} body`}
            </span>
          )}
        </span>
        {matches.length > 0 && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => selectAll(true)}
            >
              All
            </button>
            <span>·</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => selectAll(false)}
            >
              None
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {flatRows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            {!find.trim()
              ? "Select text in the URL or body, then Ctrl+Shift+H — or type to search."
              : scanning
                ? "Searching…"
                : "No results found."}
          </div>
        ) : (
          flatRows.map((row) =>
            row.type === "header" ? (
              <button
                key={`h:${row.field}`}
                type="button"
                className="sticky top-0 z-[1] flex w-full items-center gap-1 border-b border-border/50 bg-muted/80 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm hover:text-foreground"
                onClick={() =>
                  setCollapsedGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(row.field)) next.delete(row.field);
                    else next.add(row.field);
                    return next;
                  })
                }
              >
                {collapsedGroups.has(row.field) ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {row.label}
                <span className="font-normal opacity-60">({row.count})</span>
              </button>
            ) : (
              <ResultRow
                key={row.match.id}
                match={row.match}
                showDiff={showDiff}
                onToggle={toggleMatch}
              />
            ),
          )
        )}
      </div>

      {(error || status || validationError) && (
        <div className="shrink-0 border-t border-border/60 px-3 py-1.5 text-[10px]">
          {error && <p className="text-destructive">{error}</p>}
          {!error && validationError && (
            <p className="text-amber-600 dark:text-amber-400">
              {validationError}
            </p>
          )}
          {status && !error && (
            <p className="text-emerald-600 dark:text-emerald-400">{status}</p>
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY_DRAFTS: Record<string, never> = {};
const EMPTY_ENVS: never[] = [];

function ToggleIcon({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm",
        active
          ? "bg-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const ResultRow = memo(function ResultRow({
  match,
  showDiff,
  onToggle,
}: {
  match: UrlReplaceMatch;
  showDiff: boolean;
  onToggle: (id: string, selected: boolean) => void;
}) {
  const methodClass =
    match.method === "WS"
      ? "text-violet-500"
      : match.method
        ? getMethodClass(match.method)
        : "text-muted-foreground";

  const preview = truncateAround(
    match.before,
    match.matchStart,
    match.matchLength,
    56,
  );

  return (
    <div className="flex items-start gap-1.5 border-b border-border/30 px-2 py-1.5 hover:bg-muted/40">
      <Checkbox
        checked={match.selected}
        onCheckedChange={(v) => onToggle(match.id, v === true)}
        className="mt-0.5 h-3.5 w-3.5"
        aria-label={`Include ${match.name}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={cn(
              "shrink-0 font-mono text-[9px] font-semibold",
              methodClass,
            )}
          >
            {match.method ?? "—"}
          </span>
          <span className="truncate text-[11px] font-medium">{match.name}</span>
          {match.occurrenceCount > 1 && (
            <span className="shrink-0 text-[9px] text-muted-foreground">
              ×{match.occurrenceCount}
            </span>
          )}
          {match.paramPart && (
            <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
              {match.paramPart}
            </span>
          )}
        </div>
        <p
          className="truncate font-mono text-[10px] text-muted-foreground"
          title={match.before}
        >
          {preview.prefix}
          <span className="bg-destructive/20 text-destructive">
            {preview.hit}
          </span>
          {preview.suffix}
        </p>
        {showDiff && match.after !== match.before ? (
          <p
            className="truncate font-mono text-[10px] text-emerald-600 dark:text-emerald-400"
            title={match.after}
          >
            {match.after.length > 72
              ? `${match.after.slice(0, 72)}…`
              : match.after}
          </p>
        ) : null}
      </div>
    </div>
  );
});

function truncateAround(
  text: string,
  start: number,
  length: number,
  max: number,
): { prefix: string; hit: string; suffix: string } {
  const hit = text.slice(start, start + length);
  const before = text.slice(0, start);
  const after = text.slice(start + length);
  const budget = Math.max(8, max - hit.length);
  const left = Math.min(before.length, Math.floor(budget / 2));
  const right = Math.min(after.length, budget - left);
  return {
    prefix:
      (before.length > left ? "…" : "") + before.slice(before.length - left),
    hit,
    suffix: after.slice(0, right) + (after.length > right ? "…" : ""),
  };
}
