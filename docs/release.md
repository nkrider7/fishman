# Releasing Fishman

Production installers are built by GitHub Actions and attached to a [GitHub Release](https://github.com/nkrider7/fishman/releases).

| Platform | Artifact | Who it’s for |
|----------|----------|----------------|
| Linux | `.AppImage` | Portable — `chmod +x` then run |
| Linux | `.deb` | Ubuntu / Debian package install |
| Windows | NSIS `*-setup.exe` | Normal users (recommended) |
| Windows | `.msi` | IT / silent install (`msiexec /i … /quiet`) |

macOS and Authenticode signing are **not** in v1 CI (add later).

---

## Prerequisites

- Code on `main` is green (CI workflow passes)
- You can push tags to `origin` (`https://github.com/nkrider7/fishman.git`)
- No extra secrets required for unsigned releases (`GITHUB_TOKEN` is enough)

---

## Cut a release (step by step)

### 1. Bump the version everywhere (must match)

Keep these three identical (example `0.1.0` → `0.2.0`):

- `package.json` → `"version"`
- `src-tauri/tauri.conf.json` → `"version"`
- `src-tauri/Cargo.toml` → `version = "…"`

The release workflow **fails** if the git tag does not match all three.

### 2. Commit

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v0.1.0"
git push origin main
```

### 3. Tag and push the tag

```bash
git tag v0.1.0
git push origin v0.1.0
```

Use a leading `v` in the tag (`v0.1.0`), matching the version without `v` in the JSON/Cargo files.

### 4. Wait for Actions

1. Open **Actions** → workflow **Release**
2. Wait for **linux** + **windows** jobs (often 15–40+ minutes total)
3. Open **Releases** → `Fishman v0.1.0`
4. Download installers + `SHA256SUMS.txt`

### 5. Verify checksums (optional but recommended)

```bash
sha256sum -c SHA256SUMS.txt
```

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
|------|------|------|
| `.github/workflows/ci.yml` | PR + push to `main` | `npm test`, `tsc`, frontend `build` |
| `.github/workflows/release.yml` | Tag `v*` (+ manual) | Quality gate → Linux/Windows Tauri bundles → Release + checksums |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Release job fails “Version mismatch” | Align the three version fields with the tag (`v1.2.3` ↔ `1.2.3`) |
| No `.msi` / `.exe` | Check the Windows job logs; ensure `nsis`/`msi` targets in `tauri.conf.json` |
| Linux WebKit apt errors | CI installs `libwebkit2gtk-4.1-dev` on `ubuntu-22.04` — keep that runner |
| Release empty | Confirm the tag was pushed (`git push origin v0.1.0`) and Actions completed green |
