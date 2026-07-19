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
import { ApiTestingDialog } from "@/components/api-testing";
import { EnvironmentManagerDialog } from "@/components/environments/EnvironmentManagerDialog";
import { CookiesManagerDialog } from "@/components/cookies/CookiesManagerDialog";
import { ToolsPanel } from "@/components/tools-panel";
import { RequestBuilder } from "@/components/request/RequestBuilder";
import { ResponseViewer } from "@/components/response/ResponseViewer";
import { RunnerView } from "@/components/runner/RunnerView";
import { CollectionSettingsView } from "@/components/collections/settings/CollectionSettingsView";
import { GitUiView } from "@/components/git-ui";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { initDraft } from "@/store/slices/requestSlice";
import { HomePage } from "@/pages/Home";
import { cn } from "@/utils/cn";

export function AppShell() {
  const dispatch = useAppDispatch();
  const activeTabId = useAppSelector((s) => s.tabs.activeTabId);
  const tabs = useAppSelector((s) => s.tabs.tabs);
  const drafts = useAppSelector((s) => s.request.drafts);
  const collapsed = useAppSelector((s) => s.settings.sidebarCollapsed);
  const workspaceLayout = useAppSelector((s) => s.settings.workspaceLayout);
  const responseVisible = useAppSelector((s) => s.ui.responsePanelVisible);
  const scriptConsoleVisible = useAppSelector((s) => s.ui.scriptConsoleVisible);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isRunnerTab = activeTab?.kind === "runner";
  const isCollectionTab = activeTab?.kind === "collection";
  const isGitTab = activeTab?.kind === "git";
  const isSpecialTab = isRunnerTab || isCollectionTab || isGitTab;

  const isHorizontal = workspaceLayout === "horizontal";

  const { defaultLayout: sidebarLayout, onLayoutChanged: onSidebarLayoutChanged } =
    useDefaultLayout({
      id: "fishman-sidebar",
      panelIds: ["sidebar", "main"],
      storage: localStorage,
    });

  // Separate storage per orientation so resize ratios stay sensible when switching.
  const {
    defaultLayout: verticalWorkspaceLayout,
    onLayoutChanged: onVerticalWorkspaceLayoutChanged,
  } = useDefaultLayout({
    id: "fishman-workspace-vertical",
    panelIds: ["request", "response"],
    storage: localStorage,
  });

  const {
    defaultLayout: horizontalWorkspaceLayout,
    onLayoutChanged: onHorizontalWorkspaceLayoutChanged,
  } = useDefaultLayout({
    id: "fishman-workspace-horizontal",
    panelIds: ["request", "response"],
    storage: localStorage,
  });

  const {
    defaultLayout: consoleLayout,
    onLayoutChanged: onConsoleLayoutChanged,
  } = useDefaultLayout({
    id: "fishman-tools-panel",
    panelIds: ["workspace", "tools-panel"],
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
      if (tab.kind === "runner" || tab.kind === "collection" || tab.kind === "git") continue;
      if (!drafts[tab.id]) {
        dispatch(initDraft({ tabId: tab.id }));
      }
    }
  }, [tabs, drafts, dispatch]);

  const workspaceContent = !activeTabId ? (
    <HomePage />
  ) : isRunnerTab ? (
    <div className="min-h-0 min-w-0 flex-1">
      <RunnerView />
    </div>
  ) : isCollectionTab ? (
    <div className="min-h-0 min-w-0 flex-1">
      <CollectionSettingsView />
    </div>
  ) : isGitTab ? (
    <div className="min-h-0 min-w-0 flex-1">
      <GitUiView />
    </div>
  ) : responseVisible ? (
      <Group
        key={workspaceLayout}
        orientation={isHorizontal ? "horizontal" : "vertical"}
        className="min-h-0 min-w-0 flex-1"
        defaultLayout={
          isHorizontal ? horizontalWorkspaceLayout : verticalWorkspaceLayout
        }
        onLayoutChanged={
          isHorizontal
            ? onHorizontalWorkspaceLayoutChanged
            : onVerticalWorkspaceLayoutChanged
        }
      >
        <Panel
          id="request"
          defaultSize={50}
          minSize={isHorizontal ? 25 : 20}
          className="min-h-0 min-w-0"
        >
          <RequestBuilder tabId={activeTabId} />
        </Panel>
        <Separator
          className={cn(
            "bg-border transition-colors hover:bg-primary/50 data-[separator=active]:bg-primary/50",
            isHorizontal ? "w-1" : "h-1.5",
          )}
        />
        <Panel
          id="response"
          defaultSize={50}
          minSize={isHorizontal ? 25 : 20}
          className="min-h-0 min-w-0"
        >
          <ResponseViewer tabId={activeTabId} />
        </Panel>
      </Group>
    ) : (
      <div className="min-h-0 min-w-0 flex-1">
        <RequestBuilder tabId={activeTabId} />
      </div>
    );

  const mainContent = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <TabBar />
      {workspaceContent}
    </div>
  );

  const appBody = collapsed ? (
    <div className="flex h-full min-h-0 min-w-0 flex-1">
      <div className="w-12 shrink-0">
        <Sidebar />
      </div>
      {mainContent}
    </div>
  ) : (
    <Group
      orientation="horizontal"
      className="h-full min-h-0 min-w-0 flex-1"
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
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <TitleBar />

      {scriptConsoleVisible ? (
        <Group
          orientation="vertical"
          className="min-h-0 flex-1"
          defaultLayout={consoleLayout}
          onLayoutChanged={onConsoleLayoutChanged}
        >
          <Panel id="workspace" defaultSize={72} minSize={35} className="min-h-0">
            {appBody}
          </Panel>
          <Separator className="h-1.5 bg-border transition-colors hover:bg-primary/50 data-[separator=active]:bg-primary/50" />
          <Panel id="tools-panel" defaultSize={28} minSize={15} className="min-h-0">
            <ToolsPanel
              tabId={activeTabId && !isSpecialTab ? activeTabId : null}
            />
          </Panel>
        </Group>
      ) : (
        <div className="flex min-h-0 flex-1">{appBody}</div>
      )}

      <StatusBar />
      <EnvironmentManagerDialog />
      <CookiesManagerDialog />
      <ApiTestingDialog />
    </div>
  );
}
