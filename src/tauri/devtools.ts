import { invoke, isTauri } from "@tauri-apps/api/core";

/** Toggle the webview inspector. Returns the new open state, or null outside Tauri. */
export async function toggleDevTools(): Promise<boolean | null> {
  if (!isTauri()) return null;
  return invoke<boolean>("toggle_devtools");
}
