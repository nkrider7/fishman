import { getSettingJson, setSettingJson } from "@/services/dbService";
import type { SpecLink } from "./types";

const SETTINGS_KEY = "openapi_spec_links";

export async function loadAllSpecLinks(): Promise<Record<string, SpecLink>> {
  return getSettingJson<Record<string, SpecLink>>(SETTINGS_KEY, {});
}

export async function saveAllSpecLinks(
  links: Record<string, SpecLink>,
): Promise<void> {
  await setSettingJson(SETTINGS_KEY, links);
}

export async function getSpecLink(
  collectionRootId: string,
): Promise<SpecLink | null> {
  const all = await loadAllSpecLinks();
  return all[collectionRootId] ?? null;
}

export async function upsertSpecLink(link: SpecLink): Promise<SpecLink> {
  const all = await loadAllSpecLinks();
  all[link.collectionRootId] = link;
  await saveAllSpecLinks(all);
  return link;
}

export async function deleteSpecLink(collectionRootId: string): Promise<void> {
  const all = await loadAllSpecLinks();
  if (!(collectionRootId in all)) return;
  delete all[collectionRootId];
  await saveAllSpecLinks(all);
}

export async function listSpecLinks(): Promise<SpecLink[]> {
  return Object.values(await loadAllSpecLinks());
}
