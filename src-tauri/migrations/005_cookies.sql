CREATE TABLE IF NOT EXISTS cookies (
  id TEXT PRIMARY KEY NOT NULL,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  expires TEXT,
  secure INTEGER NOT NULL DEFAULT 0,
  http_only INTEGER NOT NULL DEFAULT 0,
  same_site TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cookies_domain_name_path
  ON cookies (domain, name, path);

CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies (domain);
