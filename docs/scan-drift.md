# Scan Drift

Keep a scanned API collection in sync with backend source code over time.

After you **Scanner → Import** a project, Fishman stores a **Scan Link** (project path or GitHub URL) and stamps each imported request with scanner ownership metadata. Later you can **Check for drift** and surgically sync the collection.

## How to open

- **Menu:** Tools → **Scan Drift…**
- **Scanner:** after a successful import, **Check for drift**
- **Collection tree:** right-click a **root** collection → **Scan Drift…**

## What you see

| Kind | Meaning | Sync action |
|------|---------|-------------|
| **Added** | Route exists in code, missing from collection | Create request |
| **Removed** | Scanner-owned request missing from code | Move to `_Removed by scan` |
| **Changed** | Same route identity, fields differ | Patch draft (preserves scripts & user headers) |
| **Manual** | Request not owned by scanner | Informational only — never auto-deleted |

**Sync safe** applies Added + unlocked Changed only (skips Removed).

**Sync selected** applies your checkbox selection. Removed items ask for confirmation before archiving.

## Matching rules

Routes match on:

```text
METHOD + normalized path
```

Examples that match:

- `/users/` ↔ `/users`
- `/users/:id` ↔ `/users/{id}` ↔ `/users/<id>`
- `{{baseUrl}}/users` ↔ `http://localhost:3000/users` (path only)

Locked requests (`userLocked`) are never overwritten unless you force overwrite (not exposed in v1 UI).

## What sync preserves

On **Changed** updates:

- Pre-request / post-response / test scripts
- Headers you added that the scanner did not emit
- Lock flag

Sync never wipes the whole collection (`replace` is not used).

## Watch mode

v1 is **on-demand** (Rescan button). A `watchEnabled` flag exists on the Scan Link for a future opt-in file watcher; it defaults to off.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “No scanned collection linked” | Run Scanner → Import once |
| Project path missing | Re-import from Scanner on this machine |
| Language not detected | Ensure `package.json` / `go.mod` / `Cargo.toml` / etc. at project root |
| Manual requests deleted? | They shouldn’t be — only `origin: scanner` requests appear under Removed |

## Related

OpenAPI / Swagger specs can also drive collections — see [openapi.md](openapi.md) (Spec Link + sync, same METHOD + path identity).

## Follow-ups

- Open source file at `lineNumber`
- CLI: `fishman drift --json`
