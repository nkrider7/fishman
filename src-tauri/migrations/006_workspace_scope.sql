-- Scope history and cookies per workspace (backfill to default-workspace)

ALTER TABLE history ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default-workspace';
CREATE INDEX IF NOT EXISTS idx_history_workspace ON history(workspace_id);

ALTER TABLE cookies ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default-workspace';

-- Rebuild cookies unique index to include workspace_id
DROP INDEX IF EXISTS idx_cookies_domain_name_path;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cookies_workspace_domain_name_path
  ON cookies (workspace_id, domain, name, path);
CREATE INDEX IF NOT EXISTS idx_cookies_workspace ON cookies(workspace_id);
