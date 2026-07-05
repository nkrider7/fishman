import { useEffect } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from "react-resizable-panels";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { TabBar } from "@/components/common/TabBar";
import { TitleBar } from "@/components/common/TitleBar";
import { StatusBar } from "@/components/common/StatusBar";
import { EnvironmentManagerDialog } from "@/components/environments/EnvironmentManagerDialog";
import { RequestBuilder } from "@/components/request/RequestBuilder";
import { ResponseViewer } from "@/components/response/ResponseViewer";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { initDraft } from "@/store/slices/requestSlice";
import { HomePage } from "@/pages/Home";

export function AppShell() {
  const dispatch = useAppDispatch();
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const tabs = useAppSelector((s) => s.tabs.tabs);
  const drafts = useAppSelector((s) => s.request.drafts);
  const collapsed = useAppSelector((s) => s.settings.sidebarCollapsed);
  const responseVisible = useAppSelector((s) => s.ui.responsePanelVisible);

  const { defaultLayout: sidebarLayout, onLayoutChanged: onSidebarLayoutChanged } =
    useDefaultLayout({
      id: "fishman-sidebar",
      panelIds: ["sidebar", "main"],
      storage: localStorage,
    });

  const {
    defaultLayout: workspaceLayout,
    onLayoutChanged: onWorkspaceLayoutChanged,
  } = useDefaultLayout({
    id: "fishman-workspace",
    panelIds: ["request", "response"],
    storage: localStorage,
  });

  useKeyboardShortcuts();

  useEffect(() => {
    const blockNativeContextMenu = (event: MouseEvent) => {
      if (!event.defaultPrevented) {
        event.preventDefault();
      }
    };
    document.addEventListener("contextmenu", blockNativeContextMenu);
    return () =>
      document.removeEventListener("contextmenu", blockNativeContextMenu);
  }, []);

  useEffect(() => {
    for (const tab of tabs) {
      if (!drafts[tab.id]) {
        dispatch(initDraft({ tabId: tab.id }));
      }
    }
  }, [tabs, drafts, dispatch]);

  const mainContent = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <TabBar />
      {activeTabId ? (
        responseVisible ? (
          <Group
            orientation="vertical"
            className="min-h-0 flex-1"
            defaultLayout={workspaceLayout}
            onLayoutChanged={onWorkspaceLayoutChanged}
          >
            <Panel id="request" defaultSize={50} minSize={20}>
              <RequestBuilder tabId={activeTabId} />
            </Panel>
            <Separator className="h-1.5 bg-border transition-colors hover:bg-primary/50 data-[separator=active]:bg-primary/50" />
            <Panel id="response" defaultSize={50} minSize={20}>
              <ResponseViewer tabId={activeTabId} />
            </Panel>
          </Group>
        ) : (
          <div className="min-h-0 flex-1">
            <RequestBuilder tabId={activeTabId} />
          </div>
        )
      ) : (
        <HomePage />
      )}
    </div>
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        {collapsed ? (
          <>
            <div className="w-12 shrink-0">
              <Sidebar />
            </div>
            {mainContent}
          </>
        ) : (
          <Group
            orientation="horizontal"
            className="h-full min-h-0 flex-1"
            defaultLayout={sidebarLayout}
            onLayoutChanged={onSidebarLayoutChanged}
          >
            <Panel
              id="sidebar"
              defaultSize={288}
              minSize={180}
              maxSize="50%"
              className="h-full"
            >
              <Sidebar />
            </Panel>
            <Separator className="w-1 bg-border transition-colors hover:bg-primary/50 data-[separator=active]:bg-primary/50" />
            <Panel id="main" minSize={40} className="h-full min-h-0">
              {mainContent}
            </Panel>
          </Group>
        )}
      </div>

      <StatusBar />
      <EnvironmentManagerDialog />
    </div>
  );
}
