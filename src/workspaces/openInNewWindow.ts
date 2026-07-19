import { isTauri } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { WORKSPACE_BOOT_PARAM } from "./constants";
import { getWorkspace } from "./workspaceService";

/**
 * Open a workspace in a new Tauri window (one window per workspace id).
 * If a window for that workspace already exists, focus it instead.
 */
export async function openWorkspaceInNewWindow(
  workspaceId: string,
): Promise<void> {
  if (!isTauri()) {
    // Browser/dev fallback: open same origin with query param
    const url = new URL(window.location.href);
    url.searchParams.set(WORKSPACE_BOOT_PARAM, workspaceId);
    window.open(url.toString(), `fishman-ws-${workspaceId}`);
    return;
  }

  const label = `workspace-${workspaceId}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }

  const workspace = await getWorkspace(workspaceId);
  const title = workspace
    ? `Fishman — ${workspace.name}`
    : "Fishman";

  const url = `${window.location.origin}${window.location.pathname}?${WORKSPACE_BOOT_PARAM}=${encodeURIComponent(workspaceId)}`;

  const win = new WebviewWindow(label, {
    url,
    title,
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    decorations: false,
    center: true,
    focus: true,
  });

  await new Promise<void>((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (event) => {
      reject(
        new Error(
          typeof event.payload === "string"
            ? event.payload
            : "Failed to open workspace window",
        ),
      );
    });
  });
}
