/** Scope of a Find & Replace session. */
export type UrlReplaceScopeKind =
  | "collection"
  | "folder"
  | "selected"
  | "workspace"
  | "open-tabs";

export interface UrlReplaceScope {
  kind: UrlReplaceScopeKind;
  /** Collection or folder id when kind is collection/folder. */
  folderId?: string | null;
  /** Explicit request ids when kind is selected. */
  requestIds?: string[];
}

export type UrlReplaceMode = "origin" | "literal";

/** Where a match lives inside a request / related entity. */
export type UrlReplaceField =
  | "url"
  | "body"
  | "param"
  | "folder-base"
  | "env-var"
  | "open-tab";

export interface UrlReplaceOptions {
  matchCase: boolean;
  /**
   * When true, URL matches use origin-safe replace (scheme://host[:port]).
   * Body and params always use literal text replace.
   */
  wholeOrigin: boolean;
  mode: UrlReplaceMode;
  includeUrl: boolean;
  includeBody: boolean;
  includeParams: boolean;
  includeEnvironmentVariables: boolean;
  includeFolderBaseUrl: boolean;
  includeOpenTabs: boolean;
}

export const DEFAULT_URL_REPLACE_OPTIONS: UrlReplaceOptions = {
  matchCase: false,
  wholeOrigin: false,
  mode: "literal",
  includeUrl: true,
  includeBody: true,
  includeParams: true,
  includeEnvironmentVariables: false,
  includeFolderBaseUrl: false,
  includeOpenTabs: true,
};

export type UrlReplaceMatchKind =
  | "request-url"
  | "request-body"
  | "request-param"
  | "websocket"
  | "folder-base"
  | "env-var"
  | "open-tab";

export interface UrlReplaceMatch {
  id: string;
  kind: UrlReplaceMatchKind;
  field: UrlReplaceField;
  /** Entity id (request id, folder id, env id, or tab id). */
  targetId: string;
  /** For env-var / param: nested id. */
  variableId?: string;
  /** param key or value */
  paramPart?: "key" | "value";
  name: string;
  method?: string;
  breadcrumb: string;
  before: string;
  after: string;
  /** How many occurrences were replaced in this field. */
  occurrenceCount: number;
  /** Character offset of the first match in `before` (for highlight). */
  matchStart: number;
  matchLength: number;
  selected: boolean;
  /** True when the request/folder lives on a git-native filesystem collection. */
  filesystem?: boolean;
}

export interface DetectedBase {
  origin: string;
  count: number;
}

export interface UrlReplaceUndoEntry {
  matches: Array<{
    id: string;
    kind: UrlReplaceMatchKind;
    field: UrlReplaceField;
    targetId: string;
    variableId?: string;
    paramPart?: "key" | "value";
    before: string;
    after: string;
  }>;
  appliedAt: number;
}

export interface UrlReplaceSummary {
  total: number;
  selected: number;
  urls: number;
  bodies: number;
  params: number;
  folders: number;
  envVars: number;
  openTabs: number;
}
