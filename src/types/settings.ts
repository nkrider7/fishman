export type Theme = "light" | "dark" | "system";

export interface AppSettings {
  theme: Theme;
  ignoreSsl: boolean;
  timeoutMs: number;
  sidebarCollapsed: boolean;
  activeGlobalEnvironmentId: string | null;
  activeCollectionEnvironmentIds: Record<string, string | null>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  ignoreSsl: false,
  timeoutMs: 30000,
  sidebarCollapsed: false,
  activeGlobalEnvironmentId: null,
  activeCollectionEnvironmentIds: {},
};
