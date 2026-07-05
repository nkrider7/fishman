import type { KeyValue, RequestDraft } from "@/types/request";

export const FISHMAN_EXPORT_VERSION = 1 as const;

export interface FishmanFolderExport {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  description?: string;
}

export interface FishmanRequestExport {
  id: string;
  collection_id: string;
  name: string;
  sort_order: number;
  draft: RequestDraft;
}

export interface FishmanCollectionExport {
  id: string;
  name: string;
  description?: string;
  variables?: KeyValue[];
  folders: FishmanFolderExport[];
  requests: FishmanRequestExport[];
}

export interface FishmanEnvironmentExport {
  id: string;
  name: string;
  variables: KeyValue[];
  sort_order: number;
}

export interface FishmanExportDocument {
  version: typeof FISHMAN_EXPORT_VERSION;
  app: "Fishman";
  exportedAt: string;
  collection: FishmanCollectionExport;
  environments?: FishmanEnvironmentExport[];
  metadata?: {
    includeSecrets?: boolean;
    includeMetadata?: boolean;
  };
}
