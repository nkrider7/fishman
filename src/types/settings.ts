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
  /**
   * App-wide UI zoom factor (1 = 100%).
   * Clamped to 0.5–2.0; stepped by 0.1 in the View controls.
   */
  zoomLevel: number;
  activeGlobalEnvironmentId: string | null;
  activeCollectionEnvironmentIds: Record<string, string | null>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  ignoreSsl: false,
  timeoutMs: 30000,
  sidebarCollapsed: false,
  workspaceLayout: "vertical",
  zoomLevel: 1,
  activeGlobalEnvironmentId: null,
  activeCollectionEnvironmentIds: {},
};
