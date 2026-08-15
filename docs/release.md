# Releasing Fishman

For a short ship checklist, see [release-checklist.md](release-checklist.md).

Production installers are built by GitHub Actions and attached to a [GitHub Release](https://github.com/nkrider7/fishman/releases).
| Platform | Artifact | Who it’s for |
|----------|----------|----------------|
| Linux | `.AppImage` | Portable — `chmod +x` then run |
| Linux | `.deb` | Ubuntu / Debian package install |
| Windows | NSIS `*-setup.exe` | Normal users (recommended) |
| Windows | `.msi` | IT / silent install (`msiexec /i … /quiet`) |

macOS and Authenticode signing are **not** in v1 CI (add later).

Pushing feature commits to `main` does **not** create extra branches or releases. A release starts only when the app version changes (or you push a `v*` tag yourself).

---

## Prerequisites

- Code on `main` is green (CI workflow passes)
- The three version fields match (see below)
- `CHANGELOG.md` has a `## [X.Y.Z]` section for the version you are shipping
- No extra secrets required for unsigned releases (`GITHUB_TOKEN` is enough)

---

## Cut a release (step by step)

### 1. Bump the version everywhere (must match)

Keep these three identical (example `0.1.1` → `0.1.2`):

- `package.json` → `"version"`
- `src-tauri/tauri.conf.json` → `"version"`
- `src-tauri/Cargo.toml` → `version = "…"`

Move `[Unreleased]` notes in [CHANGELOG.md](../CHANGELOG.md) into `## [X.Y.Z]`.

### 2. Commit and push `main`

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md
git commit -m "chore: release v0.1.2"
git push origin main
```

### 3. Auto-tag

The **Tag on version bump** workflow compares the previous commit. If the version changed, it creates annotated tag `v0.1.2` and starts **Release**.

Normal commits that do not change version are ignored.

### 4. Wait for Actions

1. Open **Actions** → **Tag on version bump** (should create the tag)
2. Open **Actions** → **Release** (linux + windows, often 15–40+ minutes)
3. Open **Releases** → `Fishman v0.1.2`
4. Download installers + `SHA256SUMS.txt`

Release notes are taken from `CHANGELOG.md` plus the downloads table.

### 5. Verify checksums (optional but recommended)

```bash
sha256sum -c SHA256SUMS.txt
```

---

## Manual tag fallback

If auto-tag did not run (or you prefer to tag locally):

```bash
git tag -a v0.1.2 -m "Fishman v0.1.2"
git push origin v0.1.2
```

Use a leading `v` in the tag (`v0.1.2`), matching the version without `v` in the JSON/Cargo files. Do not create extra branches for releases.

---

## Manual build without a Release

Use **Actions → Release → Run workflow** (`workflow_dispatch`).

- Builds Linux + Windows installers
- Uploads **workflow artifacts** (14-day retention)
- Does **not** create a GitHub Release

Useful for testing packaging before tagging.

---

## Local Linux-only build

On your Ubuntu machine:

```bash
npm ci
npm run tauri build
```

Outputs under:

```text
src-tauri/target/release/bundle/
  appimage/
  deb/
```

(Windows NSIS/MSI require a Windows machine or the CI matrix.)

---

## Windows SmartScreen / signing

v1 releases are **unsigned**. Windows may show “Windows protected your PC”. That is normal for new publishers.

Later: configure Authenticode signing — see [Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/).

Silent MSI example:

```powershell
msiexec /i Fishman_0.1.0_x64_en-US.msi /quiet
```

---

## Workflows in this repo

| File | When | What |
|------|------|--------|
| `.github/workflows/ci.yml` | PR + push to `main` | `npm test`, `tsc`, frontend `build` |
| `.github/workflows/tag-on-version.yml` | Push to `main` when version changes | Creates `v*` tag and calls Release |
| `.github/workflows/release.yml` | Tag `v*`, workflow_call, or manual | Quality gate → Linux/Windows bundles → Release + checksums |

Dependabot is grouped monthly (see `.github/dependabot.yml`) so it does not open one PR per package.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Release job fails “Version mismatch” | Align the three version fields with the tag (`v1.2.3` ↔ `1.2.3`) |
| Tag workflow did nothing | Version files were unchanged vs the previous commit |
| Tag already exists | Bump to a new version; existing tags are not overwritten |
| No `.msi` / `.exe` | Check the Windows job logs; ensure `nsis`/`msi` targets in `tauri.conf.json` |
| Linux WebKit apt errors | CI installs `libwebkit2gtk-4.1-dev` on `ubuntu-22.04` — keep that runner |
| Release empty | Confirm the tag exists and the Release workflow completed green |
