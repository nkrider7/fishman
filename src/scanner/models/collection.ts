import type { CollectionFolder } from "@/types/collection";
import type { RequestDraft } from "@/types/request";
import type { ApiEndpoint } from "../models/endpoint";

export interface ScannedCollection {
  rootFolder: Omit<CollectionFolder, "workspace_id" | "created_at" | "updated_at">;
  folders: Omit<CollectionFolder, "workspace_id" | "created_at" | "updated_at">[];
  requests: {
    id: string;
    collection_id: string;
    name: string;
    draft: RequestDraft;
    sort_order: number;
    endpoint: ApiEndpoint;
  }[];
}
