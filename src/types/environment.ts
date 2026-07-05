import type { KeyValue } from "@/types/request";

export type EnvironmentScope = "global" | "collection";

export interface Environment {
  id: string;
  workspace_id: string;
  collection_id: string | null;
  name: string;
  variables: KeyValue[];
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface EnvironmentDraft {
  name: string;
  variables: KeyValue[];
  collectionId?: string | null;
}
