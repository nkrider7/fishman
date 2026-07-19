import type {
  FishAuth,
  FishFolderMeta,
  FishKeyValue,
  FishScripts,
} from "../schema";
import type {
  EffectiveRequestSettings,
  FishFolderNode,
  FishRequestNode,
} from "../types";

function mergeHeaders(
  base: FishKeyValue[],
  overlay: FishKeyValue[],
): FishKeyValue[] {
  const byKey = new Map<string, FishKeyValue>();
  for (const row of base) {
    if (row.key) byKey.set(row.key.toLowerCase(), { ...row });
  }
  for (const row of overlay) {
    if (!row.key) continue;
    byKey.set(row.key.toLowerCase(), { ...row });
  }
  return [...byKey.values()];
}

function mergeScripts(
  base: FishScripts | undefined,
  overlay: FishScripts | undefined,
): FishScripts {
  return {
    preRequest: overlay?.preRequest || base?.preRequest || "",
    postResponse: overlay?.postResponse || base?.postResponse || "",
    tests: overlay?.tests || base?.tests || "",
  };
}

function mergeAuth(
  base: FishAuth | undefined,
  overlay: FishAuth | undefined,
): FishAuth {
  if (!overlay || overlay.type === "inherit") {
    return base && base.type !== "inherit" ? base : { type: "none" };
  }
  return overlay;
}

export function folderChainToRequest(
  root: FishFolderNode,
  requestRelativePath: string,
): FishFolderNode[] {
  // collections/Users/Get Users.fish → collections/Users
  const dir = requestRelativePath.includes("/")
    ? requestRelativePath.slice(0, requestRelativePath.lastIndexOf("/"))
    : "";

  const rootPath = root.relativePath;
  let relativeToRoot = dir;
  if (rootPath) {
    if (dir === rootPath) return [root];
    if (dir.startsWith(`${rootPath}/`)) {
      relativeToRoot = dir.slice(rootPath.length + 1);
    }
  }

  if (!relativeToRoot) return [root];

  const parts = relativeToRoot.split("/");
  const chain: FishFolderNode[] = [root];
  let current = root;
  let accumulated = rootPath;

  for (const part of parts) {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    const found = current.folders.find((f) => f.relativePath === accumulated);
    if (!found) break;
    chain.push(found);
    current = found;
  }

  return chain;
}

export function mergeInheritedSettings(
  folderChain: FishFolderNode[],
  request: FishRequestNode,
): EffectiveRequestSettings {
  let headers: FishKeyValue[] = [];
  let auth: FishAuth = { type: "none" };
  let scripts: FishScripts = {
    preRequest: "",
    postResponse: "",
    tests: "",
  };

  for (const folder of folderChain) {
    const meta: FishFolderMeta = folder.meta;
    if (meta.headers) headers = mergeHeaders(headers, meta.headers);
    auth = mergeAuth(auth, meta.auth);
    scripts = mergeScripts(scripts, meta.scripts);
  }

  headers = mergeHeaders(headers, request.request.headers ?? []);
  auth = mergeAuth(auth, request.request.auth);
  scripts = mergeScripts(scripts, request.request.scripts);

  return { headers, auth, scripts };
}

export function stripSecretVariables(variables: FishKeyValue[]): {
  publicVars: FishKeyValue[];
  secretVars: FishKeyValue[];
} {
  const publicVars: FishKeyValue[] = [];
  const secretVars: FishKeyValue[] = [];
  for (const row of variables) {
    if (row.secret) {
      secretVars.push({ ...row });
      publicVars.push({ ...row, value: "", secret: true });
    } else {
      publicVars.push({ ...row });
    }
  }
  return { publicVars, secretVars };
}

export function mergeSecretOverlay(
  publicVars: FishKeyValue[],
  secretVars: FishKeyValue[],
): FishKeyValue[] {
  const byKey = new Map<string, FishKeyValue>();
  for (const row of publicVars) byKey.set(row.key, { ...row });
  for (const row of secretVars) {
    const existing = byKey.get(row.key);
    if (existing) {
      byKey.set(row.key, { ...existing, value: row.value, secret: true });
    } else {
      byKey.set(row.key, { ...row, secret: true });
    }
  }
  return [...byKey.values()];
}
