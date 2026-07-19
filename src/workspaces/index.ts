export {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  WORKSPACE_BOOT_PARAM,
} from "./constants";
export type { WorkspaceRecord, WorkspaceSession, WorkspaceGitProjectBinding } from "./types";
export {
  ensureDefaultWorkspace,
  listWorkspaces,
  createWorkspace as createWorkspaceRecord,
  renameWorkspace as renameWorkspaceRecord,
  deleteWorkspace as deleteWorkspaceRecord,
  countWorkspaceItems,
  getWorkspace,
} from "./workspaceService";
export {
  saveSession,
  loadSession,
  loadOrCreateSession,
  createEmptySession,
  clearSession,
  syncWorkspaceGitProject,
  readWorkspaceGitProject,
} from "./session";
export {
  readBootWorkspaceId,
  persistActiveWorkspaceId,
  resolveInitialWorkspaceId,
} from "./boot";
export {
  bootstrapWorkspaces,
  switchWorkspace,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
} from "./switchWorkspace";
export { openWorkspaceInNewWindow } from "./openInNewWindow";
