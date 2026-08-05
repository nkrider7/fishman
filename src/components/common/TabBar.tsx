import { useEffect, useRef, useState } from "react";
import { X, Pin, Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { closeTab, setActiveTab, pinTab } from "@/store/slices/tabsSlice";
import { removeDraft, updateDraft } from "@/store/slices/requestSlice";
import { clearResponse } from "@/store/slices/responseSlice";
import { clearScriptExecution } from "@/store/slices/scriptExecutionSlice";
import { closeRunnerSession } from "@/store/slices/runnerSlice";
import { closeSettingsDraft } from "@/store/slices/collectionSettingsSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { cleanupWebSocketTabThunk } from "@/store/thunks/websocketThunks";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  createEmptyRequest,
  isWebSocketRequest,
  type RequestDraft,
  type Tab,
} from "@/types/request";

function tabMethodLabel(tab: Tab, draft?: RequestDraft): string {
  if (tab.kind === "runner") return "RUN";
  if (tab.kind === "collection") return "SET";
  if (tab.kind === "git") return "GIT";
  if (draft && isWebSocketRequest(draft)) return "WS";
  return draft?.method ?? "GET";
}

function tabMethodClass(method: string): string {
  if (method === "WS") {
    return "text-violet-600 dark:text-violet-400";
  }
  return getMethodClass(method);
}

export function TabBar() {
  const dispatch = useAppDispatch();
  const tabs = useAppSelector((s) => s.tabs.tabs);
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const runnerTabId = useAppSelector((s) => s.runner.tabId);
  const settingsTabId = useAppSelector((s) => s.collectionSettings.draft?.tabId);
  const scrollRootRef = useRef<HTMLDivElement>(null);

  // Vertical mouse wheel → horizontal scroll while hovering the tab strip.
  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;
    const viewport = root.querySelector(
      "[data-radix-scroll-area-viewport]",
    ) as HTMLElement | null;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      if (maxScroll <= 0) return;

      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;

      const next = Math.min(
        maxScroll,
        Math.max(0, viewport.scrollLeft + delta),
      );
      if (next === viewport.scrollLeft) return;

      e.preventDefault();
      viewport.scrollLeft = next;
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active tab visible when switching via Ctrl+Tab / click.
  useEffect(() => {
    if (!activeTabId) return;
    const el = scrollRootRef.current?.querySelector(
      `[data-tab-id="${CSS.escape(activeTabId)}"]`,
    );
    el?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeTabId]);

  const handleClose = (tabId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (tabId === runnerTabId) {
      dispatch(closeRunnerSession());
    }
    if (tabId === settingsTabId) {
      dispatch(closeSettingsDraft());
    }
    void dispatch(cleanupWebSocketTabThunk(tabId));
    dispatch(closeTab(tabId));
    dispatch(removeDraft(tabId));
    dispatch(clearResponse(tabId));
    dispatch(clearScriptExecution(tabId));
  };

  const handleNewTab = () => {
    dispatch(openRequestTab({ request: createEmptyRequest(), forceNew: true }));
  };

  return (
    <div className="flex h-8 shrink-0 items-center border-b bg-muted/30">
      <ScrollArea ref={scrollRootRef} className="flex-1 whitespace-nowrap">
        <div className="flex h-8 items-stretch">
          {tabs.map((tab) => (
            <RequestTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onSelect={() => dispatch(setActiveTab(tab.id))}
              onClose={(e) => handleClose(tab.id, e)}
              onPin={(e) => {
                e.stopPropagation();
                dispatch(pinTab(tab.id));
              }}
            />
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-none text-muted-foreground hover:text-foreground"
            title="New request (Ctrl+N)"
            onClick={handleNewTab}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

interface RequestTabProps {
  tab: Tab;
  isActive: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onPin: (e: React.MouseEvent) => void;
}

function RequestTab({
  tab,
  isActive,
  onSelect,
  onClose,
  onPin,
}: RequestTabProps) {
  const dispatch = useAppDispatch();
  // Per-tab method subscription — TabBar itself no longer re-renders on
  // draft keystrokes; only this tab updates when its method/protocol changes.
  const method = useAppSelector((s) =>
    tabMethodLabel(tab, s.request.drafts[tab.id]),
  );
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(tab.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraftTitle(tab.title);
    }
  }, [tab.title, editing]);

  useEffect(() => {
    if (!editing) return;
    cancelledRef.current = false;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  const isSpecialTab =
    tab.kind === "runner" || tab.kind === "collection" || tab.kind === "git";

  const commitRename = () => {
    if (isSpecialTab) {
      setEditing(false);
      return;
    }
    const trimmed = draftTitle.trim() || "Untitled Request";
    dispatch(updateDraft({ tabId: tab.id, changes: { name: trimmed } }));
    dispatch(
      updateTab({ id: tab.id, changes: { title: trimmed, unsaved: true } }),
    );
    setEditing(false);
  };

  const cancelRename = () => {
    cancelledRef.current = true;
    setDraftTitle(tab.title);
    setEditing(false);
  };

  return (
    <div
      role="tab"
      data-tab-id={tab.id}
      aria-selected={isActive}
      className={cn(
        "group relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-border/50 px-2.5 text-xs transition-colors",
        editing ? "max-w-[260px]" : "max-w-[200px]",
        isActive
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-background/55 hover:text-foreground/85",
      )}
      onClick={() => {
        if (!editing) onSelect();
      }}
      onMouseDown={(e) => {
        if (e.button === 1 && !editing) {
          e.preventDefault();
          onClose(e);
        }
      }}
    >
      {isActive ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-[#49cc90]"
        />
      ) : null}
      <span
        className={cn(
          "shrink-0 font-semibold leading-none",
          tabMethodClass(method),
        )}
      >
        {method}
      </span>

      {editing ? (
        <input
          ref={inputRef}
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className="min-w-0 flex-1 rounded-sm border border-input bg-background px-1 py-0.5 text-xs text-foreground outline-none ring-1 ring-ring"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelRename();
            }
          }}
          onBlur={() => {
            if (cancelledRef.current) {
              cancelledRef.current = false;
              return;
            }
            commitRename();
          }}
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate leading-none"
          title={
            isSpecialTab
              ? tab.title
              : `${tab.title} — double-click to rename`
          }
          onDoubleClick={(e) => {
            if (isSpecialTab) return;
            e.stopPropagation();
            setDraftTitle(tab.title);
            setEditing(true);
          }}
        >
          {tab.title}
        </span>
      )}

      {tab.unsaved && !editing && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          title="Unsaved changes"
        />
      )}
      <button
        type="button"
        title={tab.pinned ? "Unpin tab" : "Pin tab"}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted",
          tab.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          isActive && !tab.pinned && "opacity-60 group-hover:opacity-100",
        )}
        onClick={onPin}
      >
        <Pin className={cn("h-2.5 w-2.5", tab.pinned && "fill-current")} />
      </button>
      <button
        type="button"
        title="Close tab (Ctrl+W)"
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/15 hover:text-destructive",
          isActive
            ? "opacity-70 hover:opacity-100"
            : "opacity-0 group-hover:opacity-100",
        )}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClose}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
