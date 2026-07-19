import type {
  CollectionFolder,
  FolderSettings,
  PostResponseVar,
} from "@/types/collection";
import { parseFolderSettings } from "@/types/collection";
import type {
  AuthConfig,
  KeyValue,
  RequestDraft,
  RequestScripts,
} from "@/types/request";
import { EMPTY_SCRIPTS } from "@/types/request";

export interface FolderChainEntry {
  folder: CollectionFolder;
  settings: FolderSettings;
}

/** Root → leaf chain for a folder id (includes the folder itself). */
export function buildFolderChain(
  folderId: string | null | undefined,
  folders: CollectionFolder[],
): FolderChainEntry[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const leafToRoot: CollectionFolder[] = [];
  let current = byId.get(folderId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    leafToRoot.push(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return leafToRoot
    .reverse()
    .map((folder) => ({
      folder,
      settings: parseFolderSettings(folder),
    }));
}

export function mergeHeaders(
  chain: FolderChainEntry[],
  requestHeaders: KeyValue[],
): KeyValue[] {
  const map = new Map<string, KeyValue>();

  const put = (rows: KeyValue[]) => {
    for (const row of rows) {
      if (!row.enabled || !row.key.trim()) continue;
      map.set(row.key.toLowerCase(), { ...row });
    }
  };

  for (const entry of chain) put(entry.settings.headers);
  put(requestHeaders);

  return Array.from(map.values());
}

export function resolveInheritedAuth(
  chain: FolderChainEntry[],
  requestAuth: AuthConfig,
): AuthConfig {
  if (requestAuth.type !== "inherit") {
    return structuredClone(requestAuth);
  }
  // Nearest ancestor with a concrete auth (walk leaf → root of chain = reverse)
  for (let i = chain.length - 1; i >= 0; i--) {
    const auth = chain[i].settings.auth;
    if (auth.type && auth.type !== "none" && auth.type !== "inherit") {
      return structuredClone(auth);
    }
  }
  return { type: "none" };
}

export function mergeFolderVariables(
  chain: FolderChainEntry[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of chain) {
    for (const row of entry.settings.variables) {
      if (!row.enabled || !row.key.trim()) continue;
      out[row.key] = row.value;
    }
  }
  return out;
}

export function collectFolderScripts(chain: FolderChainEntry[]): {
  preRequest: string[];
  postResponse: string[];
  tests: string[];
} {
  const preRequest: string[] = [];
  const postResponse: string[] = [];
  const tests: string[] = [];

  for (const entry of chain) {
    const s = entry.settings.scripts;
    if (s.preRequest?.trim()) preRequest.push(s.preRequest);
    if (s.postResponse?.trim()) postResponse.push(s.postResponse);
    if (s.tests?.trim()) tests.push(s.tests);
  }

  return { preRequest, postResponse, tests };
}

export function joinScripts(parts: string[]): string {
  return parts.filter((p) => p.trim()).join("\n\n");
}

export function applyEffectiveRequest(
  draft: RequestDraft,
  chain: FolderChainEntry[],
): {
  request: RequestDraft;
  folderVariables: Record<string, string>;
  folderScripts: {
    preRequest: string[];
    postResponse: string[];
    tests: string[];
  };
} {
  const headers = mergeHeaders(chain, draft.headers);
  const auth = resolveInheritedAuth(chain, draft.auth);
  const folderVariables = mergeFolderVariables(chain);
  const folderScripts = collectFolderScripts(chain);

  return {
    request: {
      ...draft,
      headers,
      auth,
      scripts: draft.scripts ?? { ...EMPTY_SCRIPTS },
    },
    folderVariables,
    folderScripts,
  };
}

export function collectPostResponseVars(
  chain: FolderChainEntry[],
): PostResponseVar[] {
  const out: PostResponseVar[] = [];
  for (const entry of chain) {
    for (const row of entry.settings.postResponseVars) {
      if (row.enabled && row.key.trim() && row.expr.trim()) {
        out.push(row);
      }
    }
  }
  return out;
}

/** Minimal JSONPath: $.a.b[0].c */
export function extractJsonPath(body: string, expr: string): string | undefined {
  const trimmed = expr.trim();
  if (!trimmed) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return undefined;
  }

  const path = trimmed.startsWith("$.")
    ? trimmed.slice(2)
    : trimmed.startsWith("$")
      ? trimmed.slice(1).replace(/^\./, "")
      : trimmed;

  if (!path) {
    return typeof data === "string" ? data : JSON.stringify(data);
  }

  const parts = path.split(".").flatMap((segment) => {
    const match = segment.match(/^([^\[\]]+)((?:\[\d+\])*)$/);
    if (!match) return [segment];
    const [, key, indexes] = match;
    const idxParts = [...indexes.matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
    return [key, ...idxParts];
  });

  let current: unknown = data;
  for (const part of parts) {
    if (current == null) return undefined;
    if (/^\d+$/.test(part)) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(part)];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  if (current === undefined || current === null) return undefined;
  return typeof current === "string" ? current : JSON.stringify(current);
}

export function resolveNearestPresets(chain: FolderChainEntry[]): {
  defaultMethod?: RequestDraft["method"];
  baseUrl?: string;
  hasAuth: boolean;
} {
  let defaultMethod: RequestDraft["method"] | undefined;
  let baseUrl: string | undefined;
  let hasAuth = false;

  for (const entry of chain) {
    if (entry.settings.presets.defaultMethod) {
      defaultMethod = entry.settings.presets.defaultMethod;
    }
    if (entry.settings.presets.baseUrl?.trim()) {
      baseUrl = entry.settings.presets.baseUrl.trim();
    }
    const auth = entry.settings.auth;
    if (auth.type && auth.type !== "none" && auth.type !== "inherit") {
      hasAuth = true;
    }
  }

  return { defaultMethod, baseUrl, hasAuth };
}

export type { RequestScripts };
