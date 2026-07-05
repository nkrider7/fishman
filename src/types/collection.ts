export interface CollectionFolder {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  children?: CollectionNode[];
}

export interface SavedRequest {
  id: string;
  collection_id: string | null;
  name: string;
  method: string;
  url: string;
  headers_json: string;
  params_json: string;
  body_type: string;
  body_json: string;
  auth_type: string;
  auth_json: string;
  is_favorite: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export type CollectionNode =
  | (CollectionFolder & { type: "folder" })
  | (SavedRequest & { type: "request" });

export interface Workspace {
  id: string;
  name: string;
  created_at: number;
}
