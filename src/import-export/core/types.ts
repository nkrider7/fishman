import type { CollectionFolder } from "@/types/collection";
import type { KeyValue, RequestDraft } from "@/types/request";
import type { Environment } from "@/types/environment";

/** Canonical import payload — format-agnostic internal model */
export interface ImportResult {
  rootFolder: Omit<
    CollectionFolder,
    "workspace_id" | "created_at" | "updated_at"
  >;
  folders: Omit<
    CollectionFolder,
    "workspace_id" | "created_at" | "updated_at"
  >[];
  requests: {
    id: string;
    collection_id: string;
    name: string;
    draft: RequestDraft;
    sort_order: number;
  }[];
  variables?: KeyValue[];
  warnings?: ImportWarning[];
}

export interface ImportWarning {
  message: string;
  path?: string;
}

export interface ImportError {
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ImportPreview {
  formatId: string;
  formatLabel: string;
  collectionName: string;
  folderCount: number;
  requestCount: number;
  variableCount: number;
  folderNames: string[];
  warnings: ImportWarning[];
  errors: ImportError[];
  result: ImportResult | null;
}

export type ImportConflictStrategy = "replace" | "merge" | "duplicate" | "skip";

export interface ImportOptions {
  conflictStrategy?: ImportConflictStrategy;
}

export interface ExportOptions {
  includeVariables?: boolean;
  includeSecrets?: boolean;
  includeMetadata?: boolean;
}

export interface CollectionExportData {
  rootFolder: CollectionFolder;
  folders: CollectionFolder[];
  requests: Array<{
    sort_order: number;
    collection_id: string;
    draft: RequestDraft;
  }>;
  variables?: KeyValue[];
  environments?: Environment[];
}

export interface ImportContext {
  content: string;
  filename?: string;
}

export interface ExportContext {
  data: CollectionExportData;
  options: ExportOptions;
}

export interface ImportPlugin {
  id: string;
  name: string;
  extensions: string[];
  detect(content: string, filename?: string): boolean;
  validate(content: string): ImportError[];
  parse(content: string): ImportResult;
}

export interface ExportPlugin {
  id: string;
  name: string;
  extensions: string[];
  defaultExtension: string;
  mimeType?: string;
  serialize(ctx: ExportContext): string;
}

export const FUTURE_IMPORT_FORMATS = [
  "bruno",
  "openapi",
  "swagger",
  "insomnia",
  "har",
  "curl",
] as const;

export const FUTURE_EXPORT_FORMATS = [
  "bruno",
  "openapi",
  "har",
  "insomnia",
] as const;
