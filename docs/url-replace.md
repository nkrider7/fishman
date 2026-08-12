# Find & Replace URLs

Bulk-update request base URLs after a scanner import or when switching environments
(for example `http://localhost:3000` → `http://localhost:4000`).

## How to open

- **Shortcut:** `Ctrl+Shift+H` / `Cmd+Shift+H` — opens the **sidebar** Search panel
- **With selection:** highlight text in the URL or body, then press the shortcut — Search is prefilled
- **Sidebar icon:** Search (magnifying glass)
- **Suggest hosts:** click the lightbulb in the Search field (not shown automatically)

## What it searches

Results are grouped like VS Code files:

| Group | Contents |
|-------|----------|
| **URL** | Request URL / WebSocket URL |
| **Params** | Query param keys and values |
| **Body** | JSON / raw / GraphQL body text |

Toggle **URL / Params / Body** under “files to include”. Use **`://`** for whole-origin URL replace only.

## Behavior

- Default mode replaces the **whole origin** (`scheme://host[:port]`) only — path,
  query, and hash stay intact
- Safe against port collisions (`:3000` will not match `:30000`)
- Preview every change; include/exclude individual matches
- Optional: folder `baseUrl` presets, environment variable values, open tabs
- Session **Undo** after apply
- Persists through the normal save path (SQLite and git-native request files)

Template URLs such as `{{base_url}}/users` are left alone in request mode; enable
**Environment variable values** to update the stored `base_url` value instead.
