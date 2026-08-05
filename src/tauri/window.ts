/**
 * Show the main Tauri window after the HTML splash has painted.
 * Window starts with visible:false so users never see a blank WebView.
 */
export async function showMainWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.show();
    await win.setFocus();
  } catch {
    // Browser / non-Tauri preview — nothing to show
  }
}

export async function getFullscreen(): Promise<boolean> {
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      return getCurrentWindow().isFullscreen();
    }
  } catch {
    // fall through to browser API
  }
  return Boolean(document.fullscreenElement);
}

export async function setFullscreen(fullscreen: boolean): Promise<void> {
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const currently = await win.isFullscreen();
      if (currently === fullscreen) return;
      await win.setFullscreen(fullscreen);
      return;
    }
  } catch {
    // fall through to browser API
  }

  if (fullscreen) {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    }
  } else if (document.fullscreenElement) {
    await document.exitFullscreen?.();
  }
}

/** Prefer Redux-driven toggle via useFullscreen; this reads OS state. */
export async function toggleFullscreen(): Promise<void> {
  const current = await getFullscreen();
  await setFullscreen(!current);
}
