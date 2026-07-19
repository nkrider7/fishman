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
  return {
    type: draft.bodyType as FishBody["type"],
    content: draft.body ?? "",
  };
}

function bodyFromFish(body: FishBody | undefined): {
  bodyType: BodyType;
  body: string;
  formDataFields: FormDataField[];
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
  return {
    bodyType: body.type as BodyType,
    body: body.content ?? "",
    formDataFields: [],
  };
}

export function requestDraftToFish(
  draft: RequestDraft,
  options?: { seq?: number; createdAt?: string; updatedAt?: string },
): FishRequest {
  const now = new Date().toISOString();
  return {
    id: draft.id || createUid("req"),
    name: draft.name || "Untitled",
    method: draft.method,
    url: draft.url ?? "",
    headers: (draft.headers ?? []).map(kvToFish),
    query: (draft.params ?? []).map(kvToFish),
    body: bodyToFish(draft),
    auth: authToFish(draft.auth),
    scripts: scriptsToFish(draft.scripts ?? EMPTY_SCRIPTS),
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
  const { bodyType, body, formDataFields } = bodyFromFish(req.body);
  const base = createEmptyRequest();
  return {
    ...base,
    id: req.id,
    name: req.name,
    method: (req.method as RequestDraft["method"]) || "GET",
    url: req.url ?? "",
    params: (req.query ?? []).map(kvFromFish),
    headers: (req.headers ?? []).map(kvFromFish),
    bodyType,
    body,
    formDataFields,
    auth: authFromFish(req.auth),
    scripts: scriptsFromFish(req.scripts),
    tags: req.tags ?? [],
    collectionId: options?.collectionId,
    isFavorite: req.favorite ?? false,
  };
}
