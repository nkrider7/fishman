import { useEffect, useRef, useState } from "react";
import { X, Pin, Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { closeTab, setActiveTab, pinTab } from "@/store/slices/tabsSlice";
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { getMethodClass } from "@/utils/requestBuilder";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { createEmptyRequest, type Tab } from "@/types/request";

export function TabBar() {
  const dispatch = useAppDispatch();
  const tabs = useAppSelector((s) => s.tabs.tabs);
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const drafts = useAppSelector((s) => s.request.drafts);

  const handleClose = (tabId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch(closeTab(tabId));
  };

  return (
    <div className="flex h-8 shrink-0 items-center border-b bg-muted/30">
      <ScrollArea className="flex-1 whitespace-nowrap">
        <div className="flex h-8 items-stretch">
          {tabs.map((tab) => (
            <RequestTab
              key={tab.id}
              tab={tab}
              method={drafts[tab.id]?.method ?? "GET"}
              isActive={tab.id === activeTabId}
              onSelect={() => dispatch(setActiveTab(tab.id))}
              onClose={(e) => handleClose(tab.id, e)}
              onPin={(e) => {
                e.stopPropagation();
                dispatch(pinTab(tab.id));
              }}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-none"
        title="New tab (Ctrl+N)"
        onClick={() =>
          dispatch(openRequestTab({ request: createEmptyRequest(), forceNew: true }))
        }
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface RequestTabProps {
  tab: Tab;
  method: string;
  isActive: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onPin: (e: React.MouseEvent) => void;
}

function RequestTab({
  tab,
  method,
  isActive,
  onSelect,
  onClose,
  onPin,
}: RequestTabProps) {
  const dispatch = useAppDispatch();
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

  const commitRename = () => {
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
      aria-selected={isActive}
      className={cn(
        "group relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r px-2 text-xs transition-colors",
        editing ? "max-w-[260px]" : "max-w-[200px]",
        isActive
          ? "bg-background text-foreground shadow-[inset_0_-1px_0_0_hsl(var(--background))]"
          : "text-muted-foreground hover:bg-background/60",
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
      <span
        className={cn(
          "shrink-0 font-semibold leading-none",
          getMethodClass(method),
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
          title={`${tab.title} — double-click to rename`}
          onDoubleClick={(e) => {
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
