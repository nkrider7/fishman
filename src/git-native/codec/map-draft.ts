import type {
  AuthConfig,
  AuthType,
  BodyType,
  FormDataField,
  KeyValue,
  RequestDraft,
  RequestScripts,
} from "@/types/request";
import { EMPTY_SCRIPTS, createEmptyRequest } from "@/types/request";
import {
  ensureGraphQLConfig,
  syncGraphQLBody,
  type GraphQLConfig,
} from "@/graphql";
import {
  createDefaultWsConfig,
  type WsConfig,
  type WsMessageTemplate,
} from "@/types/websocket";
import type {
  FishAuth,
  FishBody,
  FishFormDataField,
  FishKeyValue,
  FishRequest,
  FishScripts,
} from "../schema";
import { createUid, ensureId } from "./ids";

export function kvToFish(row: KeyValue & { secret?: boolean }): FishKeyValue {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    enabled: row.enabled,
    ...(row.secret ? { secret: true } : {}),
  };
}

export function kvFromFish(row: FishKeyValue): KeyValue {
  return {
    id: ensureId(row.id, () => createUid("req")),
    key: row.key,
    value: row.value ?? "",
    enabled: row.enabled ?? true,
  };
}

function scriptsToFish(scripts: RequestScripts): FishScripts {
  return {
    preRequest: scripts.preRequest ?? "",
    postResponse: scripts.postResponse ?? "",
    tests: scripts.tests ?? "",
  };
}

function scriptsFromFish(scripts: FishScripts | undefined): RequestScripts {
  if (!scripts) return { ...EMPTY_SCRIPTS };
  return {
    preRequest: scripts.preRequest ?? "",
    postResponse: scripts.postResponse ?? "",
    tests: scripts.tests ?? "",
  };
}

function authToFish(auth: AuthConfig): FishAuth {
  return {
    type: auth.type,
    bearer: auth.bearer,
    apikey: auth.apikey,
    basic: auth.basic,
    oauth2: auth.oauth2,
    jwt: auth.jwt,
    custom: auth.custom,
  };
}

function authFromFish(auth: FishAuth | undefined): AuthConfig {
  if (!auth || auth.type === "inherit" || auth.type === "none") {
    return { type: "none" };
  }
  return {
    type: auth.type as AuthType,
    bearer: auth.bearer,
    apikey: auth.apikey,
    basic: auth.basic,
    oauth2: auth.oauth2,
    jwt: auth.jwt,
    custom: auth.custom,
  };
}

function formDataToFish(fields: FormDataField[]): FishFormDataField[] {
  return fields.map((f) => ({
    id: f.id,
    key: f.key,
    type: f.type,
    value: f.value,
    filePaths: f.filePaths,
    enabled: f.enabled,
  }));
}

function formDataFromFish(
  fields: FishFormDataField[] | undefined,
): FormDataField[] {
  if (!fields) return [];
  return fields.map((f) => ({
    id: ensureId(f.id, () => createUid("req")),
    key: f.key,
    type: f.type ?? "text",
    value: f.value ?? "",
    filePaths: f.filePaths,
    enabled: f.enabled ?? true,
  }));
}

function bodyToFish(draft: RequestDraft): FishBody {
  if (draft.bodyType === "form-data") {
    return {
      type: "form-data",
      content: "",
      formData: formDataToFish(draft.formDataFields ?? []),
    };
  }
  if (draft.bodyType === "graphql") {
    const graphql = ensureGraphQLConfig(draft);
    return {
      type: "graphql",
      content: graphql ? syncGraphQLBody(graphql) : (draft.body ?? ""),
      ...(graphql
        ? {
            graphql: {
              query: graphql.query,
              variables: graphql.variables,
              operationName: graphql.operationName,
              schemaSource: graphql.schemaSource,
              transport: graphql.transport,
            },
          }
        : {}),
    };
  }
  return {
    type: draft.bodyType as FishBody["type"],
    content: draft.body ?? "",
  };
}

function bodyFromFish(body: FishBody | undefined): {
  bodyType: BodyType;
  body: string;
  formDataFields: FormDataField[];
  graphql?: GraphQLConfig;
} {
  if (!body || body.type === "none") {
    return { bodyType: "none", body: "", formDataFields: [] };
  }
  if (body.type === "form-data") {
    return {
      bodyType: "form-data",
      body: "",
      formDataFields: formDataFromFish(body.formData),
    };
  }
  if (body.type === "graphql") {
    const structured = body.graphql;
    const graphql: GraphQLConfig | undefined = structured
      ? {
          query: structured.query ?? "",
          variables: structured.variables ?? "{\n  \n}",
          operationName: structured.operationName ?? null,
          schemaSource: structured.schemaSource ?? "none",
          transport: structured.transport ?? "http",
        }
      : ensureGraphQLConfig({
          bodyType: "graphql",
          body: body.content ?? "",
        });
    return {
      bodyType: "graphql",
      body: body.content || (graphql ? syncGraphQLBody(graphql) : ""),
      formDataFields: [],
      graphql,
    };
  }
  return {
    bodyType: body.type as BodyType,
    body: body.content ?? "",
    formDataFields: [],
  };
}

function websocketToFish(config: WsConfig | undefined) {
  if (!config) return undefined;
  return {
    messageType: config.messageType,
    messages: config.messages.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      body: m.body,
    })),
    protocols: config.protocols ?? [],
    autoReconnect: config.autoReconnect,
    reconnectIntervalMs: config.reconnectIntervalMs,
    maxReconnectAttempts: config.maxReconnectAttempts,
    showSystemFrames: config.showSystemFrames,
  };
}

function websocketFromFish(
  raw: FishRequest["websocket"] | undefined,
): WsConfig | undefined {
  if (!raw) return undefined;
  const defaults = createDefaultWsConfig();
  const messages: WsMessageTemplate[] = Array.isArray(raw.messages)
    ? raw.messages.map((m) => ({
        id: ensureId(m.id, () => createUid("req")),
        name: m.name ?? "Message",
        type: m.type ?? "text",
        body: m.body ?? "",
      }))
    : [];
  return {
    messageType: raw.messageType ?? defaults.messageType,
    messages,
    protocols: Array.isArray(raw.protocols) ? raw.protocols : [],
    autoReconnect: raw.autoReconnect ?? defaults.autoReconnect,
    reconnectIntervalMs:
      raw.reconnectIntervalMs ?? defaults.reconnectIntervalMs,
    maxReconnectAttempts:
      raw.maxReconnectAttempts ?? defaults.maxReconnectAttempts,
    showSystemFrames: raw.showSystemFrames ?? defaults.showSystemFrames,
  };
}

export function requestDraftToFish(
  draft: RequestDraft,
  options?: { seq?: number; createdAt?: string; updatedAt?: string },
): FishRequest {
  const now = new Date().toISOString();
  const protocol = draft.protocol === "websocket" ? "websocket" : "http";
  return {
    id: draft.id || createUid("req"),
    name: draft.name || "Untitled",
    protocol,
    method: draft.method,
    url: draft.url ?? "",
    headers: (draft.headers ?? []).map(kvToFish),
    query: (draft.params ?? []).map(kvToFish),
    body: bodyToFish(draft),
    auth: authToFish(draft.auth),
    scripts: scriptsToFish(draft.scripts ?? EMPTY_SCRIPTS),
    ...(protocol === "websocket"
      ? {
          websocket: websocketToFish(
            draft.websocket ?? createDefaultWsConfig(),
          ),
        }
      : {}),
    variables: [],
    tags: draft.tags ?? [],
    favorite: draft.isFavorite ?? false,
    seq: options?.seq,
    source: { kind: "manual", locked: true },
    createdAt: options?.createdAt ?? now,
    updatedAt: options?.updatedAt ?? now,
  };
}

export function fishRequestToDraft(
  req: FishRequest,
  options?: { collectionId?: string },
): RequestDraft {
  const { bodyType, body, formDataFields, graphql } = bodyFromFish(req.body);
  const base = createEmptyRequest();
  const protocol = req.protocol === "websocket" ? "websocket" : "http";
  return {
    ...base,
    id: req.id,
    name: req.name,
    protocol,
    method: (req.method as RequestDraft["method"]) || "GET",
    url: req.url ?? "",
    params: (req.query ?? []).map(kvFromFish),
    headers: (req.headers ?? []).map(kvFromFish),
    bodyType,
    body,
    formDataFields,
    graphql,
    websocket:
      protocol === "websocket"
        ? websocketFromFish(req.websocket) ?? createDefaultWsConfig()
        : undefined,
    auth: authFromFish(req.auth),
    scripts: scriptsFromFish(req.scripts),
    tags: req.tags ?? [],
    collectionId: options?.collectionId,
    isFavorite: req.favorite ?? false,
  };
}
