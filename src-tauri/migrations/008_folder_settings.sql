-- Collection / folder inherited settings (Bruno-style)
ALTER TABLE collections ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE collections ADD COLUMN headers_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE collections ADD COLUMN variables_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE collections ADD COLUMN post_response_vars_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE collections ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE collections ADD COLUMN auth_json TEXT NOT NULL DEFAULT '{"type":"none"}';
ALTER TABLE collections ADD COLUMN scripts_json TEXT NOT NULL DEFAULT '{"preRequest":"","postResponse":"","tests":""}';
ALTER TABLE collections ADD COLUMN presets_json TEXT NOT NULL DEFAULT '{}';
