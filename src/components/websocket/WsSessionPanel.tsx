import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { Button } from "@/components/ui/button";
import {
  wsFilterChanged,
  wsLogCleared,
  type WsLogFilter,
  type WsTabState,
} from "@/store/slices/websocketSlice";
import { createDefaultWsConfig } from "@/types/websocket";
import { sendWebSocketMessageThunk } from "@/store/thunks/websocketThunks";
import { updateDraft } from "@/store/slices/requestSlice";
import { updateTab } from "@/store/slices/tabsSlice";
import { maybeScheduleAutoSaveFromTab } from "@/store/thunks/filesystemAutoSaveThunks";
import { useStore } from "react-redux";
import type { RootState } from "@/store";
import type { WsMessageType } from "@/types/websocket";
import { WsConnectionStatusBar } from "./WsConnectionStatus";
import { WsEmptyState } from "./WsEmptyState";
import { WsMessageComposer } from "./WsMessageComposer";
import { WsMessageList } from "./WsMessageList";
import { cn } from "@/utils/cn";

const FILTERS: { value: WsLogFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "incoming", label: "In" },
  { value: "outgoing", label: "Out" },
  { value: "system", label: "System" },
];

const COMPOSER_HEIGHT_KEY = "fishman-ws-composer-height";
const COMPOSER_MIN = 140;
const COMPOSER_DEFAULT = 200;

interface WsSessionPanelProps {
  tabId: string;
}

const EMPTY_TAB: WsTabState = {
  status: "idle",
  sessionId: null,
  messages: [],
  truncated: false,
  error: null,
  connectedAt: null,
  sentCount: 0,
  receivedCount: 0,
  filter: "all",
  reconnectAttempts: 0,
  closeCode: null,
  closeReason: null,
};

function readStoredComposerHeight(): number {
  try {
    const raw = localStorage.getItem(COMPOSER_HEIGHT_KEY);
    if (!raw) return COMPOSER_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return COMPOSER_DEFAULT;
    return Math.max(COMPOSER_MIN, Math.round(n));
  } catch {
    return COMPOSER_DEFAULT;
  }
}

export function WsSessionPanel({ tabId }: WsSessionPanelProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const draft = useAppSelector((s) => s.request.drafts[tabId]);
  const tab = useAppSelector((s) => s.websocket.byTab[tabId]) ?? EMPTY_TAB;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [composerHeight, setComposerHeight] = useState(readStoredComposerHeight);
  const [dragging, setDragging] = useState(false);

  const splitRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(COMPOSER_DEFAULT);

  const ws = draft?.websocket ?? createDefaultWsConfig();
  const connected = tab.status === "open";
  const hasActivity = tab.messages.length > 0 || tab.status !== "idle";

  const clampHeight = useCallback((next: number) => {
    const split = splitRef.current;
    const max = split
      ? Math.max(COMPOSER_MIN, Math.floor(split.clientHeight * 0.65))
      : 420;
    return Math.min(max, Math.max(COMPOSER_MIN, Math.round(next)));
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const delta = dragStartY.current - e.clientY;
      setComposerHeight(clampHeight(dragStartHeight.current + delta));
    };

    const onUp = () => {
      setDragging(false);
      setComposerHeight((h) => {
        const clamped = clampHeight(h);
        try {
          localStorage.setItem(COMPOSER_HEIGHT_KEY, String(clamped));
        } catch {
          // ignore
        }
        return clamped;
      });
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, clampHeight]);

  if (!draft) return null;

  const setMessageType = (messageType: WsMessageType) => {
    dispatch(
      updateDraft({
        tabId,
        changes: { websocket: { ...ws, messageType } },
      }),
    );
    dispatch(updateTab({ id: tabId, changes: { unsaved: true } }));
    maybeScheduleAutoSaveFromTab(dispatch, store.getState, tabId);
  };

  const handleSend = async (type: WsMessageType, data: string) => {
    setSending(true);
    try {
      await dispatch(
        sendWebSocketMessageThunk({ tabId, type, data }),
      ).unwrap();
    } catch (err) {
      console.error("[fishman] ws send failed", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <WsConnectionStatusBar tab={tab} />

      <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border/50 px-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              tab.filter === f.value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            onClick={() =>
              dispatch(wsFilterChanged({ tabId, filter: f.value }))
            }
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        {tab.truncated && (
          <span className="mr-1 text-[10px] text-muted-foreground">
            Log truncated
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          title="Clear message log"
          disabled={!hasActivity}
          onClick={() => {
            dispatch(wsLogCleared(tabId));
            setSelectedId(null);
          }}
        >
          <Eraser className="h-3 w-3" />
          Clear
        </Button>
      </div>

      {tab.error && tab.status === "error" && (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
          {tab.error}
        </div>
      )}

      <div ref={splitRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {hasActivity ? (
            <div className="absolute inset-0">
              <WsMessageList
                messages={tab.messages}
                filter={tab.filter}
                showSystemFrames={ws.showSystemFrames}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          ) : (
            <WsEmptyState />
          )}
        </div>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize send area"
          title="Drag up or down to resize the send area"
          className={cn(
            "group relative z-10 flex h-2.5 shrink-0 cursor-row-resize items-center justify-center",
            "border-y border-border/50 bg-muted/30 transition-colors hover:bg-primary/20",
            dragging && "bg-primary/30",
          )}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragStartY.current = e.clientY;
            dragStartHeight.current = composerHeight;
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
        >
          <span
            aria-hidden
            className={cn(
              "h-1 w-12 rounded-full bg-muted-foreground/35",
              "group-hover:bg-primary/80",
              dragging && "bg-primary",
            )}
          />
        </div>

        <div
          className="shrink-0 overflow-hidden border-t border-border/40"
          style={{ height: composerHeight }}
        >
          <WsMessageComposer
            connected={connected}
            sending={sending}
            messageType={ws.messageType}
            templates={ws.messages}
            onMessageTypeChange={setMessageType}
            onSend={(type, data) => void handleSend(type, data)}
          />
        </div>
      </div>
    </div>
  );
}
