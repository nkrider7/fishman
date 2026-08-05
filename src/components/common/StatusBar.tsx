import { useEffect, useState } from "react";
import {
  Bell,
  Cookie,
  Key,
  Minus,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Terminal,
} from "lucide-react";
import { EnvironmentSelector } from "@/components/environments/EnvironmentSelector";
import { StatusBarGit } from "@/components/common/StatusBarGit";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { useAppZoom } from "@/hooks/useAppZoom";
import {
  setSidebarView,
  toggleScriptConsole,
  setCookiesManagerOpen,
} from "@/store/slices/uiSlice";
import {
  persistSettingsPatch,
  setSidebarCollapsed,
} from "@/store/slices/settingsSlice";
import { getScriptErrorFromPipeline } from "@/script-engine/utils/script-errors";
import { formatZoomPercent, modKeyLabel } from "@/utils/zoom";
import { cn } from "@/utils/cn";
import packageJson from "../../../package.json";

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

export function StatusBar() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.settings.theme);
  const isDark = useResolvedDarkMode(theme);
  const scriptConsoleVisible = useAppSelector((s) => s.ui.scriptConsoleVisible);
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const scriptError = useAppSelector((s) =>
    activeTabId
      ? getScriptErrorFromPipeline(
          s.scriptExecution.byTab[activeTabId]?.pipeline,
        )
      : null,
  );

  const openSettings = () => {
    dispatch(setSidebarCollapsed(false));
    dispatch(setSidebarView("settings"));
  };

  const toggleTheme = () => {
    void dispatch(persistSettingsPatch({ theme: isDark ? "light" : "dark" }));
  };

  return (
    <footer className="flex h-5 shrink-0 select-none items-center justify-between border-t border-border/60 bg-muted/40 px-1.5 text-[10px] leading-none text-muted-foreground">
      {/* Left cluster */}
      <div className="flex min-w-0 items-center gap-0.5">
        <StatusBarItem
          icon={Settings}
          title="Settings"
          onClick={openSettings}
        />
        <StatusBarItem icon={Key} title="Auth" disabled />
        <EnvironmentSelector />
        <StatusBarItem icon={Bell} title="Notifications" disabled />
        <StatusBarGit />
        <AutoSaveStatusItem />
      </div>

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-0.5">
        <StatusBarItem
          icon={isDark ? Sun : Moon}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          label={isDark ? "Light" : "Dark"}
          onClick={toggleTheme}
        />
        <StatusBarItem icon={Search} label="Search" disabled />
        <StatusBarItem
          icon={Cookie}
          label="Cookies"
          title="Manage cookies"
          onClick={() => dispatch(setCookiesManagerOpen(true))}
        />
        <StatusBarItem
          icon={Terminal}
          label="Console"
          title={
            scriptError
              ? `Script error: ${scriptError.error.message}`
              : "Toggle tools panel (Console, Network, Performance, Terminal). Terminal: Ctrl+`"
          }
          active={scriptConsoleVisible}
          error={!!scriptError}
          onClick={() => dispatch(toggleScriptConsole())}
        />
        <StatusBarZoomControl />
        <span className="ml-0.5 px-1 text-[9px] text-muted-foreground/70">
          v{packageJson.version}
        </span>
      </div>
    </footer>
  );
}

function StatusBarZoomControl() {
  const { zoomLevel, zoomIn, zoomOut, resetZoom, canZoomIn, canZoomOut } =
    useAppZoom();
  const mod = modKeyLabel();
  const percent = formatZoomPercent(zoomLevel);

  return (
    <div
      className="ml-0.5 flex h-4 items-center rounded border border-border/50 bg-background/40"
      title={`Zoom ${percent} (${mod}+ / ${mod}+- / ${mod}+0)`}
      role="group"
      aria-label={`Zoom ${percent}`}
    >
      <button
        type="button"
        title={`Zoom out (${mod}+-)`}
        aria-label="Zoom out"
        disabled={!canZoomOut}
        onClick={zoomOut}
        className={cn(
          "flex h-full w-4 items-center justify-center rounded-l transition-colors",
          canZoomOut
            ? "hover:bg-accent hover:text-foreground"
            : "cursor-default opacity-35",
        )}
      >
        <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        title={`Reset zoom to 100% (${mod}+0)`}
        aria-label={`Current zoom ${percent}, click to reset`}
        onClick={resetZoom}
        className="min-w-9 px-0.5 text-center font-medium tabular-nums transition-colors hover:bg-accent hover:text-foreground"
      >
        {percent}
      </button>
      <button
        type="button"
        title={`Zoom in (${mod}++)`}
        aria-label="Zoom in"
        disabled={!canZoomIn}
        onClick={zoomIn}
        className={cn(
          "flex h-full w-4 items-center justify-center rounded-r transition-colors",
          canZoomIn
            ? "hover:bg-accent hover:text-foreground"
            : "cursor-default opacity-35",
        )}
      >
        <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function AutoSaveStatusItem() {
  const sourceMode = useAppSelector((s) => s.collections.sourceMode);
  const autoSave = useAppSelector((s) => s.filesystemSync.autoSave);
  const watcherError = useAppSelector((s) => s.filesystemSync.watcherError);

  if (sourceMode !== "filesystem") return null;

  let label = "";
  let title = "Filesystem project";
  if (watcherError) {
    label = "Watch err";
    title = watcherError;
  } else if (autoSave.kind === "saving" || autoSave.kind === "pending") {
    label = "Saving…";
    title = "Auto-saving request to disk";
  } else if (autoSave.kind === "saved") {
    label = "Saved";
    title = "Request saved to fishman/";
  } else if (autoSave.kind === "error") {
    label = "Save failed";
    title = autoSave.message;
  }

  if (!label) return null;

  return (
    <span
      className={cn(
        "ml-1 truncate px-1 text-[9px]",
        autoSave.kind === "error" || watcherError
          ? "text-destructive"
          : "text-muted-foreground/80",
      )}
      title={title}
    >
      {label}
    </span>
  );
}

function StatusBarItem({
  icon: Icon,
  label,
  title,
  onClick,
  disabled,
  active,
  error,
}: {
  icon: typeof Settings;
  label?: string;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  error?: boolean;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative flex h-4 items-center gap-0.5 rounded px-1 transition-colors",
        disabled
          ? "cursor-default opacity-40"
          : active
            ? "bg-accent text-foreground"
            : error
              ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
              : "hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {label && <span className="hidden md:inline">{label}</span>}
      {error && (
        <span className="absolute -right-0.5 -top-px h-1 w-1 rounded-full bg-destructive" />
      )}
    </button>
  );
}
