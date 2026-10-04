-- Scan Drift provenance on requests (optional JSON)
ALTER TABLE requests ADD COLUMN scan_json TEXT NOT NULL DEFAULT '';
