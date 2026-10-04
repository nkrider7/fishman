# OpenAPI / Swagger

Connect a Fishman collection to an OpenAPI 3.x or Swagger 2.0 specification (JSON or YAML). Fishman can generate requests from the spec and later detect drift when the spec changes.

## Connect

**Menu:** Tools / app menu → **Connect OpenAPI Spec…**  
**Collection tree:** right-click a **root** collection → **Connect OpenAPI Spec…** or **OpenAPI Sync…**

1. Choose **URL** or **File**
2. Paste a reachable raw spec URL, or pick a local `.json` / `.yaml` / `.yml` file
3. Click **Connect**

- If opened without a collection context, Fishman creates a new collection from the spec and stores a **Spec Link**.
- If opened from an existing root, Fishman links that collection and opens **OpenAPI Sync** so you can apply differences surgically.

You can also import OpenAPI/Swagger files through the normal **Import** dialog (auto-detected).

## Sync

**OpenAPI Sync…** reloads the linked file or URL, diffs against the collection, and shows:

| Kind | Meaning | Sync action |
|------|---------|-------------|
| **Added** | Operation in spec, missing from collection | Create request |
| **Removed** | OpenAPI-owned request missing from spec | Move to `_Removed by OpenAPI` |
| **Changed** | Same METHOD + path, fields differ | Patch draft (preserves scripts & user headers) |
| **Manual** | Request not owned by OpenAPI | Informational only |

**Sync safe** applies Added + unlocked Changed (skips Removed).  
**Sync selected** applies your checkbox selection.

Matching uses the same identity rules as Scan Drift: `METHOD + normalized path` (`{id}`, `:id`, and `<id>` align).

## What is preserved

On Changed updates:

- Pre-request / post-response / test scripts
- Headers you added that the spec did not emit
- Lock flag (`scan.userLocked`)

Sync never replaces the whole collection.

## Limitations (v1)

- Local `$ref` (same document) is resolved; remote/external `$ref` files are skipped with a warning
- OpenAPI **export** is not included yet
- No continuous file watcher — recheck on demand
- OAuth2 security schemes are not turned into interactive auth flows (static bearer / apiKey / basic when clear)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| URL returned HTML | Use the raw `.json` / `.yaml` spec URL, not the Swagger UI page |
| No operations found | Ensure the document has a non-empty `paths` object |
| “No OpenAPI Spec Link” | Run **Connect OpenAPI Spec…** once for that collection |
| Manual requests deleted? | They should not be — only `origin: openapi` requests appear under Removed |
