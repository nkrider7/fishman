import { getSettingJson, setSettingJson } from "@/services/dbService";
import type { ScanLink } from "./types";

const SETTINGS_KEY = "scan_links";

export async function loadAllScanLinks(): Promise<Record<string, ScanLink>> {
  return getSettingJson<Record<string, ScanLink>>(SETTINGS_KEY, {});
}

export async function saveAllScanLinks(
  links: Record<string, ScanLink>,
): Promise<void> {
  await setSettingJson(SETTINGS_KEY, links);
}

export async function getScanLink(
  collectionRootId: string,
): Promise<ScanLink | null> {
  const all = await loadAllScanLinks();
  return all[collectionRootId] ?? null;
}

export async function upsertScanLink(link: ScanLink): Promise<ScanLink> {
  const all = await loadAllScanLinks();
  all[link.collectionRootId] = link;
  await saveAllScanLinks(all);
  return link;
}

export async function deleteScanLink(collectionRootId: string): Promise<void> {
  const all = await loadAllScanLinks();
  if (!(collectionRootId in all)) return;
  delete all[collectionRootId];
  await saveAllScanLinks(all);
}

export async function findScanLinkByProjectPath(
  projectPath: string,
): Promise<ScanLink | null> {
  const normalized = projectPath.replace(/\\/g, "/").replace(/\/$/, "");
  const all = await loadAllScanLinks();
  for (const link of Object.values(all)) {
    if (!link.projectPath) continue;
    const p = link.projectPath.replace(/\\/g, "/").replace(/\/$/, "");
    if (p === normalized) return link;
  }
  return null;
}

export async function listScanLinks(): Promise<ScanLink[]> {
  return Object.values(await loadAllScanLinks());
}
