import {
  FolderTree,
  History,
  Globe,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setEnvironmentManagerOpen, setSidebarView, type SidebarView } from "@/store/slices/uiSlice";
import { setSidebarCollapsed } from "@/store/slices/settingsSlice";
import { CollectionTree } from "@/components/collections/CollectionTree";
import { HistoryList } from "@/components/sidebar/HistoryList";
import { SettingsPage } from "@/pages/Settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const NAV_ITEMS: {
  id: SidebarView | "environments";
  label: string;
  icon: typeof FolderTree;
  opensModal?: boolean;
}[] = [
  { id: "collections", label: "Collections", icon: FolderTree },
  { id: "history", label: "History", icon: History },
  { id: "environments", label: "Environments", icon: Globe, opensModal: true },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((s) => s.ui.sidebarView);
  const collapsed = useAppSelector((s) => s.settings.sidebarCollapsed);

  const handleNavClick = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.opensModal) {
      dispatch(setEnvironmentManagerOpen(true));
      return;
    }
    dispatch(setSidebarView(item.id as SidebarView));
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r bg-muted/20 py-2">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            size="icon"
            title={item.label}
            className={cn(
              "h-8 w-8",
              !item.opensModal && view === item.id && "bg-accent",
            )}
            onClick={() => {
              if (item.opensModal) {
                dispatch(setSidebarCollapsed(false));
              }
              handleNavClick(item);
            }}
          >
            <item.icon className="h-4 w-4" />
          </Button>
        ))}
        <div className="mt-auto">
          <Button
            variant="ghost"
            size="icon"
            title="Expand sidebar"
            className="h-8 w-8"
            onClick={() => dispatch(setSidebarCollapsed(false))}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col border-r bg-muted/20">
      <nav className="flex shrink-0 items-center gap-0.5 border-b px-1.5 py-1.5">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.id}
            variant={
              !item.opensModal && view === item.id ? "secondary" : "ghost"
            }
            size="icon"
            title={item.label}
            className="h-8 w-8 shrink-0"
            onClick={() => handleNavClick(item)}
          >
            <item.icon className="h-4 w-4" />
          </Button>
        ))}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          title="Collapse sidebar"
          className="h-8 w-8 shrink-0"
          onClick={() => dispatch(setSidebarCollapsed(true))}
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </nav>

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === "collections" && <CollectionTree />}
        {view === "history" && <HistoryList />}
        {view === "settings" && <SettingsPage />}
      </div>
    </div>
  );
}
