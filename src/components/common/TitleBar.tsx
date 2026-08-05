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
import { AppMenu } from "@/components/common/AppMenu";
import { WorkspaceSwitcher } from "@/components/workspaces/WorkspaceSwitcher";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  persistSettingsPatch,
  setSidebarCollapsed,
} from "@/store/slices/settingsSlice";
import { setResponsePanelVisible } from "@/store/slices/uiSlice";
import type { WorkspaceLayout } from "@/types/settings";
import { cn } from "@/utils/cn";

export function TitleBar() {
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((s) => s.settings.sidebarCollapsed);
  const workspaceLayout = useAppSelector((s) => s.settings.workspaceLayout);
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

  const selectLayout = (layout: WorkspaceLayout) => {
    if (responseVisible && workspaceLayout === layout) {
      dispatch(setResponsePanelVisible(false));
      return;
    }
    if (workspaceLayout !== layout) {
      dispatch(persistSettingsPatch({ workspaceLayout: layout }));
    }
    dispatch(setResponsePanelVisible(true));
  };

  return (
    <header className="flex h-8 shrink-0 select-none items-center border-b border-border/60 bg-muted/50 text-foreground">
      {/* Left — app menu + workspace (not a drag region so clicks work) */}
      <div className="flex h-full min-w-40 max-w-60 items-center gap-0.5 pl-1.5 pr-1">
        <AppMenu />
        <WorkspaceSwitcher />
      </div>

      {/* Center — logo + name */}
      <div
        className="flex flex-1 items-center justify-center gap-2"
        data-tauri-drag-region
        onDoubleClick={toggleMaximize}
      >
        <AppIcon size="textlogo" />
      </div>

      {/* Right — layout toggles + window controls */}
      <div className="flex h-full items-center gap-1 pr-1">
        <div className="flex items-center gap-0.5 rounded-md p-0.5">
          <TitleBarButton
            active={!collapsed}
            title="Toggle sidebar"
            onClick={() => dispatch(setSidebarCollapsed(!collapsed))} 
            
          >
            <PanelLeft className="h-3.5 w-3.5"   />
          </TitleBarButton>
          <TitleBarButton
            active={responseVisible && workspaceLayout === "vertical"}
            title="Vertical layout (response below)"
            onClick={() => selectLayout("vertical")}
          >
            <PanelBottom className="h-3.5 w-3.5" />
          </TitleBarButton>
          <TitleBarButton
            active={responseVisible && workspaceLayout === "horizontal"}
            title="Horizontal layout (response beside)"
            onClick={() => selectLayout("horizontal")}
          >
            <PanelRight className="h-3.5 w-3.5" />
          </TitleBarButton>
        </div>

        {isTauri() && (
          <div className="ml-1 flex items-center gap-0.5 border-l border-border/50 pl-1">
            <TitleBarButton
              title="Minimize"
              onClick={handleMinimize}
              className="w-9"
            >
              <Minus className="h-3.5 w-3.5" />
            </TitleBarButton>
            <TitleBarButton
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={toggleMaximize}
              className="w-9"
            >
              <Square className="h-3 w-3" />
            </TitleBarButton>
            <TitleBarButton
              title="Close"
              onClick={handleClose}
              className="w-9 hover:bg-destructive hover:text-destructive-foreground"
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
        "flex h-6 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none",
        active && " text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
