# Detect environment from project (Phase 1)

Scan an opened project folder for dotenv files, propose Fishman variables
(`{{baseUrl}}`, `{{token}}`, …), and write them into a reviewable environment.

## Why

Open a project → review suggestions → send requests with `{{baseUrl}}` without
hand-copying ports and tokens from `.env`.

## How to run

1. **Open a project folder** (git-native workspace).
2. Menu → **Detect environment…**, or Environments manager → **Detect**.
3. Review proposed variables (secrets are masked).
4. Choose environment name (default `local`), optionally enable overwrite.
5. **Apply** — writes disk + mirrors into the global Environment Manager.

## What Phase 1 reads

Project-root files (try-read; no `exists()` on sensitive paths):

- `.env`
- `.env.local`
- `.env.development` / `.env.development.local`
- `.env.dev` / `.env.dev.local`

Skipped: `.env.example`, `.env.sample`, `.env.template`, `.env.dist`.

Compose / Kubernetes / `package.json` port detection land in later phases.

## Mapping (high confidence)

| Source key | Fishman key | Secret? |
|------------|-------------|---------|
| `PORT` | `baseUrl` = `http://localhost:<port>` | no |
| `API_URL`, `BASE_URL`, `VITE_API_URL`, `NEXT_PUBLIC_API_URL`, … | `baseUrl` | no |
| `TOKEN`, `API_TOKEN`, `ACCESS_TOKEN`, … | `token` | yes |
| `DATABASE_URL`, `POSTGRES_URL`, … | `databaseUrl` (camelCase) | yes if URL has user:pass |

When multiple keys map to `baseUrl` / `token`, the highest-rank winner is
enabled; originals may appear as disabled aliases.

## Where values are written

For filesystem workspaces (`fishman/`):

| File | Contents |
|------|----------|
| `fishman/environments/<name>.json` | Public vars; secret keys marked `secret: true` with **empty** values |
| `fishman/environments/<name>.secret.json` | Secret values (gitignored via `*.secret.json`) |

Also mirrored into the SQLite **global** environment of the same name so the
Environment Manager and `{{variable}}` resolution work immediately.

## Apply semantics

- Missing keys → added
- Existing keys with different values → **skipped** unless “Overwrite existing values”
- Applying twice with the same values is idempotent
- Never deletes user keys

## Module map

| Path | Role |
|------|------|
| `src/env-detect/` | Parse, classify, suggest, scan, merge, apply |
| `src/components/env-detect/EnvDetectDialog.tsx` | Review UI |
| `src/store/slices/envDetectSlice.ts` | Open / scan / apply thunks |

## Security

- Secret values are never shown in full in the dialog
- Evidence / toasts avoid printing token-like values
- Fixtures use fake secrets only
- Do not commit `*.secret.json` or project `.env*` files

## Roadmap

- Phase 2: `docker-compose.yml` ports + environment
- Phase 3: Kubernetes ConfigMap / Secret key detection
- Phase 4: Prompt once after open when env is still the default stub
