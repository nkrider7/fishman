# Release checklist

Use this checklist when cutting a Fishman release. Detailed commands and
artifact notes also live in [release.md](release.md).

## 1. Preflight

- [ ] `main` is green (CI workflow)
- [ ] Outstanding security advisories reviewed
- [ ] Changelog `[Unreleased]` section drafted into a version heading
- [ ] Roadmap / docs updated if user-facing behavior changed

## 2. Version bump

Keep these three identical (example `0.1.1` → `0.1.2`):

- [ ] `package.json` → `"version"`
- [ ] `src-tauri/tauri.conf.json` → `"version"`
- [ ] `src-tauri/Cargo.toml` → `version = "…"`

The release workflow fails if the git tag does not match all three.

## 3. Testing

- [ ] `npm test`
- [ ] `npx tsc --noEmit`
- [ ] `cd src-tauri && cargo check`
- [ ] Manual smoke: REST, GraphQL, WebSocket, environment variables
- [ ] Manual smoke: import/export and Git-native save (if touched)

## 4. Changelog & commit

- [ ] Update [CHANGELOG.md](../CHANGELOG.md) (Keep a Changelog) with `## [0.1.2]`
- [ ] Commit version bump + changelog and push `main` only (no extra branches)

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md
git commit -m "chore: release v0.1.2"
git push origin main
```

## 5. Auto-tag

- [ ] Confirm **Tag on version bump** created `v0.1.2`
- [ ] Confirm **Release** started for that tag

Fallback if auto-tag did not run:

```bash
git tag -a v0.1.2 -m "Fishman v0.1.2"
git push origin v0.1.2
```

## 6. Build binaries

- [ ] Confirm GitHub Actions **Release** workflow started for the tag
- [ ] Wait for Linux + Windows artifacts to finish
- [ ] Download and spot-check at least one installer per OS you support

## 7. GitHub Release

- [ ] Release notes summarize user-facing changes (from CHANGELOG)
- [ ] Artifacts attached by the workflow (AppImage, deb, NSIS, MSI)
- [ ] Mark as latest / pre-release appropriately

## 8. Checksums

- [ ] Publish or verify SHA256 checksums for artifacts (workflow or manual)

```bash
sha256sum Fishman_*.AppImage Fishman_*.deb Fishman_*-setup.exe Fishman_*.msi
```

Document checksums in the release body when not auto-generated.

## 9. Post-release

- [ ] Announce in GitHub Discussions (Announcements)
- [ ] Close / milestone related issues
- [ ] Bump roadmap “Completed” as needed
- [ ] Watch for early regression reports

## Emergency hotfix

1. Branch from the release tag if needed
2. Apply minimal fix + tests
3. Bump patch version with the same three-file rule
4. Tag and release following the steps above
