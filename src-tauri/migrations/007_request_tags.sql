-- Lightweight tags for collection runner include/exclude filters
ALTER TABLE requests ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
