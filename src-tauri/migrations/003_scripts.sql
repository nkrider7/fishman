ALTER TABLE requests ADD COLUMN scripts_json TEXT NOT NULL DEFAULT '{"preRequest":"","postResponse":"","tests":""}';
