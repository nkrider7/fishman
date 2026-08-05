import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/hooks/redux";
import { isTerminalAvailable } from "@/tauri/terminal";
import { cn } from "@/utils/cn";
import { XtermSession } from "./XtermSession";

interface TerminalSessionMeta {
  localId: string;
  title: string;
  cwd: string | null;
  status: "starting" | "running" | "exited" | "error";
  ptySessionId?: string;
  shell?: string;
  error?: string;
}

let sessionCounter = 1;

function nextLocalId(): string {
  return `local-${sessionCounter++}`;
}

function folderName(path: string | null): string {
  if (!path) return "home";
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function makeSession(cwd: string | null): TerminalSessionMeta {
  return {
    localId: nextLocalId(),
    title: folderName(cwd),
    cwd,
    status: "starting",
  };
}

function useResolvedDarkMode(theme: "light" | "dark" | "system"): boolean {
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (theme === "dark") return true;
  if (theme === "light") return false;
  return systemDark;
}

export function TerminalTab({ active = true }: { active?: boolean }) {
  const projectPath = useAppSelector((s) => s.git.projectPath);
  const theme = useAppSelector((s) => s.settings.theme);
  const dark = useResolvedDarkMode(theme);
  const available = isTerminalAvailable();

  const defaultCwd = projectPath;

  // No session until the user clicks +
  const [sessions, setSessions] = useState<TerminalSessionMeta[]>([]);
  const [activeLocalId, setActiveLocalId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);

  useEffect(() => {
    if (active && activeLocalId) setFocusToken((n) => n + 1);
  }, [active, activeLocalId]);

  const activeSession = useMemo(
    () =>
      sessions.find((s) => s.localId === activeLocalId) ?? sessions[0] ?? null,
    [sessions, activeLocalId],
  );

  const createSession = useCallback(() => {
    const meta = makeSession(defaultCwd);
    setSessions((prev) => [...prev, meta]);
    setActiveLocalId(meta.localId);
    setFocusToken((n) => n + 1);
  }, [defaultCwd]);

  const removeSession = useCallback(
    (localId: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.localId !== localId);
        if (activeLocalId === localId) {
          setActiveLocalId(next[next.length - 1]?.localId ?? null);
        }
        return next;
      });
      setFocusToken((n) => n + 1);
    },
    [activeLocalId],
  );

  if (!available) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="max-w-sm text-center text-xs text-muted-foreground">
          The integrated terminal requires the desktop app. Run{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
            npm run tauri dev
          </code>{" "}
          to use a real shell here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-44 shrink-0 flex-col border-r border-border bg-muted/20">
        <div className="flex h-7 items-center justify-between border-b border-border/60 px-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            Sessions
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            title="New terminal session"
            onClick={createSession}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
          {sessions.length === 0 ? (
            <div className="flex flex-1 items-start justify-center p-3">
              <p className="text-center text-[11px] text-muted-foreground">
                No sessions yet.
                <br />
                <span className="text-[10px]">Click + to start a terminal</span>
              </p>
            </div>
          ) : (
            sessions.map((session) => {
              const selected = session.localId === activeSession?.localId;
              return (
                <div
                  key={session.localId}
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px]",
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                    onClick={() => {
                      setActiveLocalId(session.localId);
                      setFocusToken((n) => n + 1);
                    }}
                  >
                    <TerminalSquare className="h-3 w-3 shrink-0 opacity-70" />
                    <span className="truncate font-medium">{session.title}</span>
                    {session.status === "exited" && (
                      <span className="shrink-0 text-[9px] opacity-60">
                        exit
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="invisible shrink-0 rounded p-0.5 hover:bg-background/60 group-hover:visible"
                    title="Kill session"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSession(session.localId);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
        {activeSession?.cwd && (
          <div
            className="truncate border-t border-border/60 px-2 py-1 text-[10px] text-muted-foreground"
            title={activeSession.cwd}
          >
            {activeSession.cwd}
          </div>
        )}
      </aside>

      <div
        className={cn(
          "relative min-h-0 min-w-0 flex-1",
          dark ? "bg-[#0f1115]" : "bg-[#fafafa]",
        )}
      >
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-xs text-muted-foreground">
              No terminal session selected
            </p>
          </div>
        ) : (
          sessions.map((session) => (
            <XtermSession
              key={session.localId}
              localId={session.localId}
              cwd={session.cwd}
              active={active && session.localId === activeSession?.localId}
              dark={dark}
              focusToken={
                session.localId === activeSession?.localId ? focusToken : 0
              }
              onReady={(ptySessionId, meta) => {
                setSessions((prev) =>
                  prev.map((s) =>
                    s.localId === session.localId
                      ? {
                          ...s,
                          ptySessionId,
                          cwd: meta.cwd,
                          shell: meta.shell,
                          title: folderName(meta.cwd),
                          status: "running",
                        }
                      : s,
                  ),
                );
              }}
              onExit={() => {
                setSessions((prev) =>
                  prev.map((s) =>
                    s.localId === session.localId
                      ? { ...s, status: "exited" }
                      : s,
                  ),
                );
              }}
              onError={(message) => {
                setSessions((prev) =>
                  prev.map((s) =>
                    s.localId === session.localId
                      ? { ...s, status: "error", error: message }
                      : s,
                  ),
                );
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
