import {
  Bell,
  Cookie,
  Key,
  Search,
  Settings,
  Wrench,
} from "lucide-react";
import { AppIcon } from "@/components/common/AppIcon";
import { EnvironmentSelector } from "@/components/environments/EnvironmentSelector";
import { useAppDispatch } from "@/hooks/redux";
import { toggleDevTools } from "@/tauri/devtools";
import { setSidebarView } from "@/store/slices/uiSlice";
import { setSidebarCollapsed } from "@/store/slices/settingsSlice";
import { cn } from "@/utils/cn";
import packageJson from "../../../package.json";

export function StatusBar() {
  const dispatch = useAppDispatch();

  const openSettings = () => {
    dispatch(setSidebarCollapsed(false));
    dispatch(setSidebarView("settings"));
  };

  return (
    <footer className="flex h-7 shrink-0 select-none items-center justify-between border-t border-border/60 bg-[#111111] px-2 text-xs text-muted-foreground">
      {/* Left cluster */}
      <div className="flex items-center gap-1">
        <StatusBarItem
          icon={Settings}
          title="Settings"
          onClick={openSettings}
        />
        <StatusBarItem icon={Key} title="Auth" disabled />
        <EnvironmentSelector />
        <StatusBarItem icon={Bell} title="Notifications" disabled />
        <div className="mx-1 hidden h-3 w-px bg-border/60 sm:block" />
        <button
          type="button"
          className="hidden items-center gap-1.5 px-1.5 transition-colors hover:text-foreground sm:flex"
          title="Fishman API Client"
        >
          <AppIcon size="xs" />
          <span>Fishman</span>
        </button>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1">
        <StatusBarItem icon={Search} label="Search" disabled />
        <StatusBarItem icon={Cookie} label="Cookies" disabled />
        <StatusBarItem
          icon={Wrench}
          label="Dev Tools"
          title="Toggle developer tools"
          onClick={() => {
            void toggleDevTools();
          }}
        />
        <span className="ml-1 px-1.5 text-[10px] text-muted-foreground/70">
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
}: {
  icon: typeof Settings;
  label?: string;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
        disabled
          ? "cursor-default opacity-40"
          : "hover:bg-white/10 hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {label && <span className="hidden md:inline">{label}</span>}
    </button>
  );
}
