-- Hot-path indexes for collections / requests / history.
-- Without these, folder trees, sibling reorder, and history loads full-scan.

CREATE INDEX IF NOT EXISTS idx_collections_parent_id
  ON collections(parent_id);

CREATE INDEX IF NOT EXISTS idx_collections_workspace_id
  ON collections(workspace_id);

CREATE INDEX IF NOT EXISTS idx_requests_collection_id
  ON requests(collection_id);

CREATE INDEX IF NOT EXISTS idx_history_created_at
  ON history(created_at DESC);
