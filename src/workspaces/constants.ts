/** Stable id for the seeded Personal workspace — never change. */
export const DEFAULT_WORKSPACE_ID = "default-workspace";
export const DEFAULT_WORKSPACE_NAME = "Personal";

export const ACTIVE_WORKSPACE_STORAGE_KEY = "fishman.activeWorkspaceId";

/** Per-workspace git-native project bindings (survives HMR / reloads). */
export const GIT_PROJECT_BINDINGS_STORAGE_KEY = "fishman.workspaceGitProjects";

/** Query/hash param used when opening a workspace in a new Tauri window. */
export const WORKSPACE_BOOT_PARAM = "workspaceId";
