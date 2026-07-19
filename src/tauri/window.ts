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
