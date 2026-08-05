import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  createTerminalSession,
  killTerminal,
  onTerminalExit,
  onTerminalOutput,
  resizeTerminal,
  writeTerminal,
} from "@/tauri/terminal";
import { cn } from "@/utils/cn";

export interface XtermSessionProps {
  /** Stable React key / local id — PTY id is created inside. */
  localId: string;
  cwd: string | null;
  active: boolean;
  dark: boolean;
  onReady?: (ptySessionId: string, meta: { cwd: string; shell: string }) => void;
  onExit?: (ptySessionId: string) => void;
  onError?: (message: string) => void;
  focusToken?: number;
}

function buildTheme(dark: boolean) {
  if (dark) {
    return {
      background: "#0f1115",
      foreground: "#e6e8ec",
      cursor: "#e6e8ec",
      cursorAccent: "#0f1115",
      selectionBackground: "#3d4450",
      black: "#0f1115",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#fbbf24",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#22d3ee",
      white: "#e6e8ec",
      brightBlack: "#6b7280",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde68a",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#ffffff",
    };
  }
  return {
    background: "#fafafa",
    foreground: "#18181b",
    cursor: "#18181b",
    cursorAccent: "#fafafa",
    selectionBackground: "#d4d4d8",
    black: "#18181b",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#fafafa",
    brightBlack: "#71717a",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#ffffff",
  };
}

export function XtermSession({
  localId,
  cwd,
  active,
  dark,
  onReady,
  onExit,
  onError,
  focusToken = 0,
}: XtermSessionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const onReadyRef = useRef(onReady);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);
  // Boot only after the session has been shown once (correct size + focus).
  const [started, setStarted] = useState(false);

  onReadyRef.current = onReady;
  onExitRef.current = onExit;
  onErrorRef.current = onError;

  useEffect(() => {
    if (active) setStarted(true);
  }, [active]);

  // Create xterm + PTY once the session is first shown.
  useEffect(() => {
    if (!started) return;
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: buildTheme(dark),
      allowProposedApi: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(el);
    termRef.current = term;
    fitRef.current = fit;

    const syncSize = () => {
      try {
        fit.fit();
      } catch {
        // ignore fit errors when hidden
      }
      const ptyId = ptyIdRef.current;
      if (ptyId && term.cols > 0 && term.rows > 0) {
        void resizeTerminal(ptyId, term.cols, term.rows).catch(() => {});
      }
    };

    const boot = async () => {
      try {
        // Wait a frame so the panel layout has real dimensions.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (disposed) return;

        fit.fit();
        const cols = Math.max(term.cols || 80, 20);
        const rows = Math.max(term.rows || 24, 8);
        const created = await createTerminalSession({
          cols,
          rows,
          cwd,
        });
        if (disposed) {
          await killTerminal(created.sessionId).catch(() => {});
          return;
        }
        ptyIdRef.current = created.sessionId;
        onReadyRef.current?.(created.sessionId, {
          cwd: created.cwd,
          shell: created.shell,
        });

        unlistenOutput = await onTerminalOutput((payload) => {
          if (payload.sessionId !== created.sessionId) return;
          term.write(payload.data);
        });
        unlistenExit = await onTerminalExit((payload) => {
          if (payload.sessionId !== created.sessionId) return;
          term.writeln("\r\n\x1b[90m[Process exited]\x1b[0m");
          onExitRef.current?.(created.sessionId);
        });

        term.onData((data) => {
          const id = ptyIdRef.current;
          if (!id) return;
          void writeTerminal(id, data).catch(() => {});
        });

        resizeObserver = new ResizeObserver(() => {
          if (el.clientWidth === 0) return;
          syncSize();
        });
        resizeObserver.observe(el);
        requestAnimationFrame(syncSize);
        term.focus();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start terminal";
        term.writeln(`\x1b[31m${message}\x1b[0m`);
        onErrorRef.current?.(message);
      }
    };

    void boot();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      unlistenOutput?.();
      unlistenExit?.();
      const ptyId = ptyIdRef.current;
      ptyIdRef.current = null;
      if (ptyId) void killTerminal(ptyId).catch(() => {});
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Intentionally only re-boot when localId/cwd/started change — theme updates separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId, cwd, started]);

  // Theme updates without restarting the shell.
  useEffect(() => {
    if (termRef.current?.options) {
      termRef.current.options.theme = buildTheme(dark);
    }
  }, [dark]);

  // Refit + focus when becoming active or when focus is requested.
  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      const ptyId = ptyIdRef.current;
      if (ptyId && term.cols > 0 && term.rows > 0) {
        void resizeTerminal(ptyId, term.cols, term.rows).catch(() => {});
      }
      term.focus();
    });
  }, [active, focusToken]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-full min-h-0 w-full overflow-hidden p-1 [&_.xterm]:h-full [&_.xterm-viewport]:overflow-auto",
        !active && "hidden",
      )}
      data-terminal-local-id={localId}
    />
  );
}

