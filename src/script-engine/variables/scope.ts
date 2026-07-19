import type { ScriptVariableMap, VariableScope } from "../types";

const SCOPE_PRIORITY: VariableScope[] = [
  "local",
  "folder",
  "collection",
  "environment",
  "workspace",
  "global",
  "system",
];

export function createEmptyVariableMap(): ScriptVariableMap {
  return {
    local: {},
    folder: {},
    collection: {},
    environment: {},
    workspace: {},
    global: {},
    system: {},
  };
}

export function mergeVariableMaps(
  ...maps: Partial<ScriptVariableMap>[]
): ScriptVariableMap {
  const result = createEmptyVariableMap();
  for (const map of maps) {
    for (const scope of SCOPE_PRIORITY) {
      Object.assign(result[scope], map[scope] ?? {});
    }
  }
  return result;
}

export function resolveVariable(
  key: string,
  variables: ScriptVariableMap,
): { value: string | undefined; scope: VariableScope | null } {
  for (const scope of SCOPE_PRIORITY) {
    const value = variables[scope][key];
    if (value !== undefined) return { value, scope };
  }
  return { value: undefined, scope: null };
}

export function resolveAllVariables(
  variables: ScriptVariableMap,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const scope of [...SCOPE_PRIORITY].reverse()) {
    Object.assign(resolved, variables[scope]);
  }
  return resolved;
}

export function replaceVariablesIn(
  text: string,
  variables: ScriptVariableMap,
): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    const { value } = resolveVariable(key, variables);
    return value !== undefined ? value : match;
  });
}

export function applyVariableChange(
  variables: ScriptVariableMap,
  key: string,
  value: string,
  scope: VariableScope = "local",
): ScriptVariableMap {
  return {
    ...variables,
    [scope]: { ...variables[scope], [key]: value },
  };
}

export function unsetVariable(
  variables: ScriptVariableMap,
  key: string,
  scope?: VariableScope,
): ScriptVariableMap {
  if (scope) {
    const next = { ...variables[scope] };
    delete next[key];
    return { ...variables, [scope]: next };
  }

  const next = createEmptyVariableMap();
  for (const s of SCOPE_PRIORITY) {
    next[s] = { ...variables[s] };
    delete next[s][key];
  }
  return next;
}
