-- WebSocket request protocol + config (additive; HTTP rows keep defaults).
ALTER TABLE requests ADD COLUMN protocol TEXT NOT NULL DEFAULT 'http';
ALTER TABLE requests ADD COLUMN websocket_json TEXT NOT NULL DEFAULT '';
