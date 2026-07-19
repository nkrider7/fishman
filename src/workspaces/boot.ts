import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_BOOT_PARAM,
} from "./constants";

/** Read workspace id from URL (?workspaceId=) for secondary windows. */
export function readBootWorkspaceId(
  search = typeof window !== "undefined" ? window.location.search : "",
): string | null {
  try {
    const params = new URLSearchParams(search);
    const id = params.get(WORKSPACE_BOOT_PARAM)?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export function persistActiveWorkspaceId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function readPersistedActiveWorkspaceId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function resolveInitialWorkspaceId(
  availableIds: string[],
  bootId: string | null = readBootWorkspaceId(),
): string {
  if (bootId && availableIds.includes(bootId)) return bootId;
  const persisted = readPersistedActiveWorkspaceId();
  if (persisted && availableIds.includes(persisted)) return persisted;
  if (availableIds.includes(DEFAULT_WORKSPACE_ID)) return DEFAULT_WORKSPACE_ID;
  return availableIds[0] ?? DEFAULT_WORKSPACE_ID;
}
