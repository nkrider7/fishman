import type { ApiResponse } from "@/types/response";
import type { RequestDraft, Tab } from "@/types/request";

export interface WorkspaceRecord {
  id: string;
  name: string;
  created_at: number;
}

/** Bound git-native project for one Fishman UI workspace (in-memory session). */
export interface WorkspaceGitProjectBinding {
  projectPath: string;
  workspaceRootPath: string;
  workspaceName: string;
}

/** UI session persisted in memory (and optionally localStorage) per workspace. */
export interface WorkspaceSession {
  tabs: Tab[];
  activeTabId: string | null;
  drafts: Record<string, RequestDraft>;
  responses: Record<string, ApiResponse | null>;
  activeGlobalEnvironmentId: string | null;
  activeCollectionEnvironmentIds: Record<string, string | null>;
  selectedFolderId: string | null;
  /** Open git-native project for this workspace, or null for SQLite collections. */
  gitProject: WorkspaceGitProjectBinding | null;
}
