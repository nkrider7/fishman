import { openUrl } from "@tauri-apps/plugin-opener";

/** Open an https URL in the system browser (Tauri opener, with window fallback). */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export const FISHMAN_LINKS = {
  repo: "https://github.com/nkrider7/fishman",
  license: "https://github.com/nkrider7/fishman/blob/main/LICENSE",
  releases: "https://github.com/nkrider7/fishman/releases",
  koFi: "https://ko-fi.com/B6E223SE98",
} as const;
