import { generateId } from "@/utils/id";
import { createEmptyRequest } from "@/types/request";
import { GIT_PROJECT_BINDINGS_STORAGE_KEY } from "./constants";
import type {
  WorkspaceGitProjectBinding,
  WorkspaceSession,
} from "./types";

const sessions = new Map<string, WorkspaceSession>();

/** In-memory durable bindings (Node tests + cache). Synced to localStorage in browser. */
let durableGitBindings: Record<string, WorkspaceGitProjectBinding> = {};

function isGitBinding(value: unknown): value is WorkspaceGitProjectBinding {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.projectPath === "string" &&
    typeof v.workspaceRootPath === "string" &&
    typeof v.workspaceName === "string" &&
    Boolean(v.projectPath) &&
    Boolean(v.workspaceRootPath) &&
    Boolean(v.workspaceName)
  );
}

function parseBindingsObject(
  parsed: unknown,
): Record<string, WorkspaceGitProjectBinding> {
  if (!parsed || typeof parsed !== "object") return {};
  const out: Record<string, WorkspaceGitProjectBinding> = {};
  for (const [id, binding] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (isGitBinding(binding)) out[id] = binding;
  }
  return out;
}

function readPersistedGitBindings(): Record<string, WorkspaceGitProjectBinding> {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(GIT_PROJECT_BINDINGS_STORAGE_KEY);
      if (raw) {
        const parsed = parseBindingsObject(JSON.parse(raw));
        durableGitBindings = parsed;
        return { ...parsed };
      }
    }
  } catch {
    // fall through to memory
  }
  return { ...durableGitBindings };
}

function writePersistedGitBindings(
  all: Record<string, WorkspaceGitProjectBinding>,
): void {
  durableGitBindings = { ...all };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        GIT_PROJECT_BINDINGS_STORAGE_KEY,
        JSON.stringify(all),
      );
    }
  } catch {
    // Quota / private mode — memory cache still works for this run.
  }
}

/** Read durable git binding for a Fishman UI workspace. */
export function readWorkspaceGitProject(
  workspaceId: string,
): WorkspaceGitProjectBinding | null {
  return readPersistedGitBindings()[workspaceId] ?? null;
}

export function persistWorkspaceGitProject(
  workspaceId: string,
  binding: WorkspaceGitProjectBinding | null,
): void {
  const all = readPersistedGitBindings();
  if (binding) all[workspaceId] = binding;
  else delete all[workspaceId];
  writePersistedGitBindings(all);
}

/**
 * Update in-memory session + localStorage so a workspace keeps its git project
 * across switches (and HMR), without waiting for the next switchWorkspace.
 */
export function syncWorkspaceGitProject(
  workspaceId: string,
  binding: WorkspaceGitProjectBinding | null,
): void {
  const session = loadOrCreateSession(workspaceId);
  session.gitProject = binding;
  sessions.set(workspaceId, structuredClone(session));
  persistWorkspaceGitProject(workspaceId, binding);
}

function normalizeSession(session: WorkspaceSession): WorkspaceSession {
  if (session.gitProject === undefined) {
    session.gitProject = null;
  }
  return session;
}

export function createEmptySession(): WorkspaceSession {
  const tabId = generateId();
  return {
    tabs: [
      {
        id: tabId,
        title: "Untitled Request",
        unsaved: false,
        pinned: false,
      },
    ],
    activeTabId: tabId,
    drafts: { [tabId]: createEmptyRequest() },
    responses: {},
    activeGlobalEnvironmentId: null,
    activeCollectionEnvironmentIds: {},
    selectedFolderId: null,
    gitProject: null,
  };
}

export function saveSession(
  workspaceId: string,
  session: WorkspaceSession,
): void {
  const normalized = normalizeSession(structuredClone(session));
  sessions.set(workspaceId, normalized);
  persistWorkspaceGitProject(workspaceId, normalized.gitProject);
}

export function loadSession(workspaceId: string): WorkspaceSession | null {
  const existing = sessions.get(workspaceId);
  if (!existing) return null;
  return normalizeSession(structuredClone(existing));
}

export function loadOrCreateSession(workspaceId: string): WorkspaceSession {
  const session = loadSession(workspaceId) ?? createEmptySession();
  // Hydrate durable binding when memory session has none (HMR / cold start).
  if (!session.gitProject) {
    const persisted = readWorkspaceGitProject(workspaceId);
    if (persisted) session.gitProject = persisted;
  }
  return session;
}

export function clearSession(workspaceId: string): void {
  sessions.delete(workspaceId);
  persistWorkspaceGitProject(workspaceId, null);
}

/** Test helper */
export function __resetSessionsForTests(): void {
  sessions.clear();
  durableGitBindings = {};
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(GIT_PROJECT_BINDINGS_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
