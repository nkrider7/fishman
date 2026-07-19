# Git-native Fishman workspaces

Fishman treats API collections like **source code**.

Everything lives in the user's project under `fishman/`.

- No proprietary collection database for Git workspaces
- No binary formats
- No hidden cache as source of truth
- Human-readable JSON (`.fish` requests)
- First-class Git diffs, branches, merges, and collaboration

> Local SQLite remains available only as a transitional personal scratch pad. Git-linked work is filesystem-first.

## Layout

```
project/
├── .git/
└── fishman/
    ├── workspace.json
    ├── .gitignore
    ├── environments/
    │   ├── local.json
    │   ├── local.secret.json      # gitignored
    │   ├── dev.json
    │   └── production.json
    ├── collections/
    │   ├── Users/
    │   │   ├── _folder.json
    │   │   ├── Get Users.fish
    │   │   └── Create User.fish
    │   └── Auth/
    │       ├── _folder.json
    │       └── Login.fish
    ├── scripts/
    ├── tests/
    ├── mocks/
    ├── variables/
    └── history/                   # gitignored
```

### Multi-workspace

Either:

1. **Single** — `fishman/workspace.json` (one workspace), or
2. **Multiple** — `fishman/Backend/workspace.json`, `fishman/Mobile/workspace.json`, …

`discoverWorkspaces(projectPath)` finds both shapes.

## Request file (`.fish`)

Pretty-printed JSON. Deterministic key order. LF endings. Stable header/query/variable sorting.

```json
{
    "auth": {
        "type": "none"
    },
    "body": {
        "content": "",
        "type": "json"
    },
    "createdAt": "2026-01-01T00:00:00.000Z",
    "headers": [],
    "id": "req_123",
    "method": "POST",
    "name": "Create User",
    "query": [],
    "scripts": {
        "preRequest": "",
        "postResponse": "",
        "tests": ""
    },
    "source": {
        "kind": "manual",
        "locked": true
    },
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "url": "{{baseUrl}}/users",
    "variables": []
}
```

Rules:

- **Keep `id`** across renames (Git sees rename; identity stays stable)
- **Duplicate** → new `id`
- **`source.locked`** — scanner must not overwrite manual edits
- Atomic writes: temp → replace

## Secrets

- `*.secret.json`, `.env.secret`, `.env.local` are gitignored
- Public env files may mark `secret: true` with empty values; overlays supply real values locally

## Git

- Detect `.git` via filesystem (no unsafe shell)
- Full operations (status, commit, push, pull, branch, merge, conflict UI) use an isomorphic-git / libgit2 abstraction — never ad-hoc shell
- UI targets: Git Enabled / Initialize Git, status panel, diff viewer, branch awareness, timeline

## Module map

| Path | Role |
|------|------|
| `src/git-native/schema/` | Zod + format constants |
| `src/git-native/codec/` | Parse / serialize / atomic write / draft map |
| `src/git-native/workspace/` | Create + discover workspaces |
| `src/git-native/git/` | Detection + operations contract |
| `src/git-native/fs/` | FS adapter (memory for tests) |
| `src/git-native/fixtures/` | Golden project |

## Roadmap (beyond codec)

1. Sync engine + file watcher on `fishman/`
2. Auto-save every edit
3. Redux/UI: open project, Git tab, diff, conflicts
4. isomorphic-git implementation of `GitOperations`
5. Scanner → propose new/updated `.fish` without clobbering locked requests
6. Search index, lazy load, virtual scroll for large workspaces
7. Field-level merge + API change dashboard

## Non-goals for the current foundation

- Replacing app settings / window state storage
- Embedding a full Git hosting UI (PRs on GitHub)
- Cloud sync
