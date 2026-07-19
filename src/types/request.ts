import type { HttpMethodName } from "@/http-methods/types";
import { HTTP_METHOD_ORDER } from "@/http-methods/registry";

/** Canonical HTTP methods — driven by the method registry. */
export type HttpMethod = HttpMethodName;

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
  | "inherit"
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
  /** Text content or display label for file fields */
  value: string;
  /** Absolute paths on disk for file fields (Tauri) */
  filePaths?: string[];
  /** @deprecated Use filePaths. Migrated on load for legacy saved requests. */
  filePath?: string;
  enabled: boolean;
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/** Returns normalized file paths for a form field, migrating legacy filePath. */
export function getFormDataFilePaths(field: FormDataField): string[] {
  if (field.filePaths && field.filePaths.length > 0) {
    return field.filePaths;
  }
  if (field.filePath) {
    return [field.filePath];
  }
  return [];
}

export function formatFormDataFileLabel(paths: string[]): string {
  if (paths.length === 0) return "";
  if (paths.length === 1) return basename(paths[0]);
  return `${paths.length} files`;
}

export function normalizeFormDataField(field: FormDataField): FormDataField {
  const filePaths = getFormDataFilePaths(field);
  const { filePath: _legacy, ...rest } = field;
  return {
    ...rest,
    filePaths: filePaths.length > 0 ? filePaths : undefined,
    value:
      field.type === "file" && filePaths.length > 0
        ? formatFormDataFileLabel(filePaths)
        : field.value,
  };
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
  scripts: RequestScripts;
  /** Tags for collection runner include/exclude filters. */
  tags?: string[];
  collectionId?: string;
  isFavorite?: boolean;
}

export interface RequestScripts {
  preRequest: string;
  postResponse: string;
  tests: string;
}

export const EMPTY_SCRIPTS: RequestScripts = {
  preRequest: "",
  postResponse: "",
  tests: "",
};

export interface Tab {
  id: string;
  title: string;
  requestId?: string;
  unsaved: boolean;
  pinned: boolean;
  /** Default request tab; runner / collection settings / git are dedicated views. */
  kind?: "request" | "runner" | "collection" | "git";
  runnerCollectionId?: string;
  runnerFolderId?: string | null;
  /** Folder id when kind is "collection". */
  collectionFolderId?: string;
}

/** Display order from the HTTP method registry (GET, QUERY, POST, …). */
export const HTTP_METHODS: HttpMethod[] = [...HTTP_METHOD_ORDER];

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
    scripts: { ...EMPTY_SCRIPTS },
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
          formDataFields: (parsed as FormDataField[]).map(normalizeFormDataField),
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
