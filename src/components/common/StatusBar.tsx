import { useEffect, useState } from "react";
import {
  Bell,
  Cookie,
  Key,
  Moon,
  Search,
  Settings,
  Sun,
  Terminal,
  Wrench,
} from "lucide-react";
import { EnvironmentSelector } from "@/components/environments/EnvironmentSelector";
import { StatusBarGit } from "@/components/common/StatusBarGit";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { toggleDevTools } from "@/tauri/devtools";
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
              : "Toggle tools panel (Console, Network, Performance, Terminal)"
          }
          active={scriptConsoleVisible}
          error={!!scriptError}
          onClick={() => dispatch(toggleScriptConsole())}
        />
        <StatusBarItem
          icon={Wrench}
          label="Dev Tools"
          title="Toggle developer tools"
          onClick={() => {
            void toggleDevTools();
          }}
        />
        <span className="ml-0.5 px-1 text-[9px] text-muted-foreground/70">
          v{packageJson.version}
        </span>
      </div>
    </footer>
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
