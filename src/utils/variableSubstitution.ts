import type { AuthConfig, KeyValue, RequestDraft } from "@/types/request";

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g;

export type VariableScope = "global" | "collection";

export interface VariableInfo {
  value: string;
  scope: VariableScope;
  isLive?: boolean;
}

export function buildVariableInfoMap(
  globalVariables: KeyValue[],
  collectionVariables: KeyValue[],
): Record<string, VariableInfo> {
  const map: Record<string, VariableInfo> = {};

  for (const variable of globalVariables) {
    if (variable.enabled && variable.key) {
      map[variable.key] = { value: variable.value, scope: "global" };
    }
  }

  for (const variable of collectionVariables) {
    if (variable.enabled && variable.key) {
      map[variable.key] = { value: variable.value, scope: "collection" };
    }
  }

  return map;
}

export function buildVariableMap(
  globalVariables: KeyValue[],
  collectionVariables: KeyValue[],
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const variable of globalVariables) {
    if (variable.enabled && variable.key) {
      map[variable.key] = variable.value;
    }
  }

  for (const variable of collectionVariables) {
    if (variable.enabled && variable.key) {
      map[variable.key] = variable.value;
    }
  }

  return map;
}

export function substituteVariables(
  text: string,
  variables: Record<string, string>,
): string {
  if (!text.includes("{{")) return text;

  return text.replace(VARIABLE_PATTERN, (match, rawKey: string) => {
    const key = rawKey.trim();
    if (key in variables) return variables[key];
    return match;
  });
}

function substituteKeyValues(
  items: KeyValue[],
  variables: Record<string, string>,
): KeyValue[] {
  return items.map((item) => ({
    ...item,
    key: substituteVariables(item.key, variables),
    value: substituteVariables(item.value, variables),
  }));
}

function substituteAuth(auth: AuthConfig, variables: Record<string, string>): AuthConfig {
  switch (auth.type) {
    case "bearer":
      return {
        ...auth,
        bearer: auth.bearer
          ? {
              token: substituteVariables(auth.bearer.token, variables),
            }
          : undefined,
      };
    case "basic":
      return {
        ...auth,
        basic: auth.basic
          ? {
              username: substituteVariables(auth.basic.username, variables),
              password: substituteVariables(auth.basic.password, variables),
            }
          : undefined,
      };
    case "apikey":
      return {
        ...auth,
        apikey: auth.apikey
          ? {
              ...auth.apikey,
              key: substituteVariables(auth.apikey.key, variables),
              value: substituteVariables(auth.apikey.value, variables),
            }
          : undefined,
      };
    case "jwt":
      return {
        ...auth,
        jwt: auth.jwt
          ? {
              token: substituteVariables(auth.jwt.token, variables),
            }
          : undefined,
      };
    case "custom":
      return {
        ...auth,
        custom: auth.custom
          ? {
              key: substituteVariables(auth.custom.key, variables),
              value: substituteVariables(auth.custom.value, variables),
            }
          : undefined,
      };
    case "oauth2":
      return {
        ...auth,
        oauth2: auth.oauth2
          ? {
              ...auth.oauth2,
              accessToken: substituteVariables(auth.oauth2.accessToken, variables),
            }
          : undefined,
      };
    default:
      return auth;
  }
}

export function substituteRequestDraft(
  request: RequestDraft,
  variables: Record<string, string>,
): RequestDraft {
  if (Object.keys(variables).length === 0) return request;

  return {
    ...request,
    url: substituteVariables(request.url, variables),
    params: substituteKeyValues(request.params, variables),
    headers: substituteKeyValues(request.headers, variables),
    body: substituteVariables(request.body, variables),
    formDataFields: request.formDataFields?.map((field) => ({
      ...field,
      key: substituteVariables(field.key, variables),
      value: substituteVariables(field.value, variables),
    })),
    auth: substituteAuth(request.auth, variables),
  };
}

export function findUnresolvedVariables(text: string): string[] {
  const unresolved = new Set<string>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(VARIABLE_PATTERN.source, "g");
  while ((match = pattern.exec(text)) !== null) {
    unresolved.add(match[1].trim());
  }
  return Array.from(unresolved);
}
