-- Git-native / filesystem-linked collections (cache + index; disk is source of truth)
ALTER TABLE collections ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'sqlite';
ALTER TABLE collections ADD COLUMN source_path TEXT;
ALTER TABLE collections ADD COLUMN sync_status TEXT;
ALTER TABLE collections ADD COLUMN last_synced_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_collections_source_path
  ON collections(source_path)
  WHERE source_path IS NOT NULL;
