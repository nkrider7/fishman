# Philosophy

## Why Fishman exists

Modern API work should feel like editing code: fast, local, reviewable, and
under your control. Many clients grew into cloud products with accounts, sync
taxes, and heavy runtimes. Fishman exists to prove that a native, privacy-first
API client can still feel premium.

## Git-first workflow

Collections should be able to live beside the services they describe. Git-native
workspaces store requests as deterministic JSON you can branch, review, and
merge. Secrets stay out of the repo. The database remains for personal app state;
Git remains for shared truth.

## Native performance

HTTP belongs in Rust. Fishman uses Tauri and `reqwest` so request execution is
not tied to a Chromium-sized app shell. The UI stays responsive; the backend
does the heavy lifting.

## Privacy

By default, nothing leaves your machine. No mandatory account. No silent cloud
sync. Export and Git are explicit choices. Treat secrets carefully — especially
in shared workspaces.

## Offline-first

If your laptop and the API you are testing are reachable, Fishman should work.
Features that need the network (releases, remote scan of a GitHub URL) are
optional paths, not the core product contract.

## Developer experience

- Keyboard-first shortcuts
- Variable-aware inputs
- Monaco where editing matters
- Scanners that turn real code into collections
- Import paths that respect how teams already work (e.g. Postman)

DX also means a clear codebase: plugin seams for scanners and formats, typed IPC,
and docs that help contributors land safely.

## What we optimize for

| Prefer | Over |
|--------|------|
| Local control | Forced cloud |
| Small native shell | Electron-sized runtime |
| Reviewable files | Opaque proprietary blobs |
| Focused UI | Feature sprawl without craft |
| Explicit consent | Hidden telemetry |

## What we will not compromise

- User data ownership
- Clear licensing and trademark boundaries
- Respectful community standards

Read next: [architecture.md](architecture.md), [roadmap.md](roadmap.md),
[branding.md](branding.md).
