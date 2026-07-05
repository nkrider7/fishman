import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Minus,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Square,
  X,
} from "lucide-react";
import { AppIcon } from "@/components/common/AppIcon";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setSidebarCollapsed } from "@/store/slices/settingsSlice";
import { setResponsePanelVisible } from "@/store/slices/uiSlice";
import { cn } from "@/utils/cn";

export function TitleBar() {
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((s) => s.settings.sidebarCollapsed);
  const responseVisible = useAppSelector((s) => s.ui.responsePanelVisible);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    win.isMaximized().then(setIsMaximized);
    const unlisten = win.onResized(async () => {
      setIsMaximized(await win.isMaximized());
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleMaximize = async () => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const maximized = await win.isMaximized();
    if (maximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
    setIsMaximized(await win.isMaximized());
  };

  const handleMinimize = async () => {
    if (!isTauri()) return;
    await getCurrentWindow().minimize();
  };

  const handleClose = async () => {
    if (!isTauri()) return;
    await getCurrentWindow().close();
  };

  return (
    <header className="flex h-7 shrink-0 select-none items-center border-b border-border/60 bg-[#111111] text-foreground">
      {/* Drag region — left */}
      <div
        className="flex h-full w-28 items-center"
        data-tauri-drag-region
      />

      {/* Center — logo + name */}
      <div
        className="flex flex-1 items-center justify-center gap-2"
        data-tauri-drag-region
        onDoubleClick={toggleMaximize}
      >
        <AppIcon size="sm" />
        <span className="text-xs font-semibold tracking-wide">Fishman</span>
      </div>

      {/* Right — layout toggles + window controls */}
      <div className="flex h-full items-center">
        <div className="flex items-center  px-1">
          <TitleBarButton
            active={!collapsed}
            title="Toggle sidebar"
            onClick={() => dispatch(setSidebarCollapsed(!collapsed))}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </TitleBarButton>
          <TitleBarButton
            active={responseVisible}
            title="Toggle response panel"
            onClick={() =>
              dispatch(setResponsePanelVisible(!responseVisible))
            }
          >
            <PanelBottom className="h-3.5 w-3.5" />
          </TitleBarButton>
          <TitleBarButton
            active={false}
            title="Toggle right panel"
            onClick={() => {}}
            disabled
          >
            <PanelRight className="h-3.5 w-3.5 opacity-40" />
          </TitleBarButton>
        </div>

        {isTauri() && (
          <div className="flex items-center">
            <TitleBarButton
              title="Minimize"
              onClick={handleMinimize}
              className="w-10"
            >
              <Minus className="h-3.5 w-3.5" />
            </TitleBarButton>
            <TitleBarButton
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={toggleMaximize}
              className="w-10"
            >
              <Square className="h-3 w-3" />
            </TitleBarButton>
            <TitleBarButton
              title="Close"
              onClick={handleClose}
              className="w-10 hover:bg-red-600 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </TitleBarButton>
          </div>
        )}
      </div>
    </header>
  );
}

function TitleBarButton({
  children,
  onClick,
  title,
  active,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-6 p-2 rounded-md items-center justify-center text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:pointer-events-none",
        active && "text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
