import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetSessionsForTests,
  createEmptySession,
  loadOrCreateSession,
  loadSession,
  saveSession,
  clearSession,
  readWorkspaceGitProject,
  syncWorkspaceGitProject,
  persistWorkspaceGitProject,
} from "@/workspaces/session";
import {
  readBootWorkspaceId,
  resolveInitialWorkspaceId,
} from "@/workspaces/boot";
import {
  DEFAULT_WORKSPACE_ID,
} from "@/workspaces/constants";
import { captureGitProjectBinding } from "@/workspaces/switchWorkspace";
import type { RootState } from "@/store";

describe("workspace session", () => {
  beforeEach(() => {
    __resetSessionsForTests();
  });

  it("saves and restores a session", () => {
    const session = createEmptySession();
    session.tabs[0]!.title = "Login";
    saveSession("ws-a", session);

    const loaded = loadSession("ws-a");
    expect(loaded?.tabs[0]?.title).toBe("Login");
    expect(loadSession("ws-b")).toBeNull();
  });

  it("empty sessions have no git project binding", () => {
    expect(createEmptySession().gitProject).toBeNull();
  });

  it("saves and restores git project binding per workspace", () => {
    const binding = {
      projectPath: "/repos/soul-server",
      workspaceRootPath: "/repos/soul-server/fishman",
      workspaceName: "soul-server",
    };
    const sessionA = createEmptySession();
    sessionA.gitProject = binding;
    saveSession("soulserver", sessionA);

    const sessionB = createEmptySession();
    sessionB.gitProject = null;
    saveSession("personal", sessionB);

    expect(loadSession("soulserver")?.gitProject).toEqual(binding);
    expect(loadSession("personal")?.gitProject).toBeNull();
  });

  it("loadOrCreateSession hydrates durable git binding after memory wipe", () => {
    const binding = {
      projectPath: "/repos/soul-server",
      workspaceRootPath: "/repos/soul-server/fishman",
      workspaceName: "soul-server",
    };
    syncWorkspaceGitProject("soulserver", binding);
    expect(readWorkspaceGitProject("soulserver")).toEqual(binding);

    // Drop only the UI session Map; keep durable bindings (like session HMR).
    clearSession("soulserver");
    // clearSession clears durable too — re-seed durable only:
    persistWorkspaceGitProject("soulserver", binding);

    const session = loadOrCreateSession("soulserver");
    expect(session.gitProject).toEqual(binding);
  });

  it("persistWorkspaceGitProject alone is enough to hydrate", () => {
    const binding = {
      projectPath: "/repos/x",
      workspaceRootPath: "/repos/x/fishman",
      workspaceName: "x",
    };
    persistWorkspaceGitProject("ws", binding);
    expect(loadOrCreateSession("ws").gitProject).toEqual(binding);
  });

  it("loadOrCreateSession returns empty when missing", () => {
    const session = loadOrCreateSession("new");
    expect(session.tabs).toHaveLength(1);
    expect(session.activeTabId).toBe(session.tabs[0]!.id);
    expect(session.gitProject).toBeNull();
  });

  it("clearSession removes stored session and durable binding", () => {
    const binding = {
      projectPath: "/repos/x",
      workspaceRootPath: "/repos/x/fishman",
      workspaceName: "x",
    };
    syncWorkspaceGitProject("ws", binding);
    clearSession("ws");
    expect(loadSession("ws")).toBeNull();
    expect(readWorkspaceGitProject("ws")).toBeNull();
  });
});

describe("captureGitProjectBinding", () => {
  function stubState(
    overrides: {
      sourceMode?: "sqlite" | "filesystem";
      projectPath?: string | null;
      workspaceRootPath?: string | null;
      workspaceName?: string | null;
    } = {},
  ): RootState {
    return {
      collections: {
        sourceMode: overrides.sourceMode ?? "sqlite",
      },
      git: {
        projectPath: overrides.projectPath ?? null,
        workspaceRootPath: overrides.workspaceRootPath ?? null,
        workspaceName: overrides.workspaceName ?? null,
      },
    } as RootState;
  }

  it("captures binding whenever project paths are set", () => {
    expect(
      captureGitProjectBinding(
        stubState({
          sourceMode: "sqlite",
          projectPath: "/repos/x",
          workspaceRootPath: "/repos/x/fishman",
          workspaceName: "x",
        }),
      ),
    ).toEqual({
      projectPath: "/repos/x",
      workspaceRootPath: "/repos/x/fishman",
      workspaceName: "x",
    });
  });

  it("returns null when no project path", () => {
    expect(
      captureGitProjectBinding(
        stubState({
          sourceMode: "filesystem",
          projectPath: null,
        }),
      ),
    ).toBeNull();
  });

  it("captures binding when filesystem project is open", () => {
    expect(
      captureGitProjectBinding(
        stubState({
          sourceMode: "filesystem",
          projectPath: "/repos/soul-server",
          workspaceRootPath: "/repos/soul-server/fishman",
          workspaceName: "soul-server",
        }),
      ),
    ).toEqual({
      projectPath: "/repos/soul-server",
      workspaceRootPath: "/repos/soul-server/fishman",
      workspaceName: "soul-server",
    });
  });
});

describe("workspace boot", () => {
  it("reads workspaceId from query string", () => {
    expect(readBootWorkspaceId("?workspaceId=abc")).toBe("abc");
    expect(readBootWorkspaceId("?foo=1")).toBeNull();
  });

  it("resolveInitialWorkspaceId prefers boot, then persisted, then default", () => {
    const ids = [DEFAULT_WORKSPACE_ID, "other"];
    expect(resolveInitialWorkspaceId(ids, "other")).toBe("other");
    expect(resolveInitialWorkspaceId(ids, "missing")).toBe(
      DEFAULT_WORKSPACE_ID,
    );
    expect(resolveInitialWorkspaceId(["only"], null)).toBe("only");
  });
});
