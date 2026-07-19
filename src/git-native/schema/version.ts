/** On-disk Fishman project format version (`workspace.json` → `version`). */
export const FISHMAN_PROJECT_FORMAT_VERSION = 1 as const;

export type FishmanProjectFormatVersion = typeof FISHMAN_PROJECT_FORMAT_VERSION;

/** Directory name under the project root. */
export const FISHMAN_DIR = "fishman";

export const WORKSPACE_FILE = "workspace.json";
export const ENVIRONMENTS_DIR = "environments";
export const COLLECTIONS_DIR = "collections";
export const SCRIPTS_DIR = "scripts";
export const TESTS_DIR = "tests";
export const MOCKS_DIR = "mocks";
export const VARIABLES_DIR = "variables";
export const HISTORY_DIR = "history";

/** Request file extension (JSON). */
export const REQUEST_EXT = ".fish";

/** Folder metadata file inside a collection directory. */
export const FOLDER_META_FILE = "_folder.json";

export const SECRETS_SUFFIX = ".secret.json";
export const ENV_SECRET_FILES = [".env.secret", ".env.local"] as const;

/** Default `.gitignore` for a fishman/ workspace (secrets + local-only dirs). */
export const DEFAULT_FISHMAN_GITIGNORE = `# Local-only / generated
history/
logs/
cache/
temp/
.fishman/

# Secrets — never commit
*.secret.json
.env.secret
.env.local
*.local.json
`;
