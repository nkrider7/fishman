export type Theme = "light" | "dark" | "system";

/** How request and response panels are arranged in the workspace. */
export type WorkspaceLayout = "vertical" | "horizontal";

export interface AppSettings {
  theme: Theme;
  ignoreSsl: boolean;
  timeoutMs: number;
  sidebarCollapsed: boolean;
  /** `vertical` = response below request; `horizontal` = response beside request. */
  workspaceLayout: WorkspaceLayout;
  activeGlobalEnvironmentId: string | null;
  activeCollectionEnvironmentIds: Record<string, string | null>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  ignoreSsl: false,
  timeoutMs: 30000,
  sidebarCollapsed: false,
  workspaceLayout: "vertical",
  activeGlobalEnvironmentId: null,
  activeCollectionEnvironmentIds: {},
};
