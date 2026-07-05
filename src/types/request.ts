export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type BodyType =
  | "none"
  | "json"
  | "form-data"
  | "x-www-form-urlencoded"
  | "raw"
  | "xml"
  | "html"
  | "graphql"
  | "binary";

export type AuthType =
  | "none"
  | "bearer"
  | "apikey"
  | "basic"
  | "oauth2"
  | "jwt"
  | "custom";

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type FormDataFieldType = "text" | "file";

export interface FormDataField {
  id: string;
  key: string;
  type: FormDataFieldType;
  /** Text content or display filename for file fields */
  value: string;
  /** Absolute path on disk for file fields (Tauri) */
  filePath?: string;
  enabled: boolean;
}

export interface AuthConfig {
  type: AuthType;
  bearer?: { token: string };
  apikey?: { key: string; value: string; addTo: "header" | "query" };
  basic?: { username: string; password: string };
  oauth2?: { accessToken: string };
  jwt?: { token: string };
  custom?: { key: string; value: string };
}

export interface RequestDraft {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  bodyType: BodyType;
  body: string;
  formDataFields: FormDataField[];
  auth: AuthConfig;
  collectionId?: string;
  isFavorite?: boolean;
}

export interface Tab {
  id: string;
  title: string;
  requestId?: string;
  unsaved: boolean;
  pinned: boolean;
}

export const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
];

export const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "json", label: "JSON" },
  { value: "form-data", label: "Form Data" },
  { value: "x-www-form-urlencoded", label: "x-www-form-urlencoded" },
  { value: "raw", label: "Raw Text" },
  { value: "xml", label: "XML" },
  { value: "html", label: "HTML" },
  { value: "graphql", label: "GraphQL" },
  { value: "binary", label: "Binary File" },
];

export function createEmptyRequest(name = "Untitled Request"): RequestDraft {
  return {
    id: crypto.randomUUID(),
    name,
    method: "GET",
    url: "",
    params: [],
    headers: [],
    bodyType: "none",
    body: "",
    formDataFields: [],
    auth: { type: "none" },
  };
}

export function createFormDataField(
  type: FormDataFieldType = "text",
): FormDataField {
  return {
    id: crypto.randomUUID(),
    key: "",
    type,
    value: "",
    enabled: true,
  };
}

export function serializeBodyForStorage(request: RequestDraft): string {
  if (request.bodyType === "form-data") {
    return JSON.stringify(request.formDataFields ?? []);
  }
  return request.body;
}

export function deserializeBodyFromStorage(
  bodyType: BodyType,
  bodyJson: string,
): Pick<RequestDraft, "body" | "formDataFields"> {
  if (bodyType === "form-data") {
    try {
      const parsed: unknown = JSON.parse(bodyJson || "[]");
      if (Array.isArray(parsed)) {
        return {
          body: "",
          formDataFields: parsed as FormDataField[],
        };
      }
    } catch {
      // Legacy plain-text body stored before form-data support
    }
    return { body: "", formDataFields: [] };
  }
  return { body: bodyJson || "", formDataFields: [] };
}

export function createKeyValue(): KeyValue {
  return {
    id: crypto.randomUUID(),
    key: "",
    value: "",
    enabled: true,
  };
}
