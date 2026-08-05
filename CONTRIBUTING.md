# Contributing to Fishman

Thank you for your interest in contributing to Fishman. This guide explains how
to set up a development environment, propose changes, and get your pull request
reviewed.

By participating, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Introduction

Fishman is an open-source, native, Git-first API client. Contributions of all
kinds are welcome:

- Bug reports and fixes
- Feature proposals and implementations
- Documentation improvements
- Scanner / import-export plugins
- Performance and accessibility work
- Tests and CI improvements

If you are unsure where to start, open a discussion or look for issues labeled
`good first issue` or `help wanted`.

## Development environment

### Requirements

| Tool | Version | Notes |
|------|---------|--------|
| Node.js | **20+** (22 LTS recommended) | Required for Vite / frontend |
| npm | Comes with Node | Package manager used in CI |
| Rust | **stable** via [rustup](https://rustup.rs/) | Required for Tauri backend |
| Platform deps | See [Tauri prerequisites](https://tauri.app/start/prerequisites/) | WebKitGTK on Linux, etc. |

**Ubuntu / Debian:**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Install

```bash
git clone https://github.com/nkrider7/fishman.git
cd fishman
npm install
```

### Run (development)

```bash
npm run tauri dev
```

This starts the Vite frontend and the Tauri/Rust backend together.

Frontend-only Vite server (no native shell):

```bash
npm run dev
```

### Build

```bash
npm run tauri build
```

### Lint / typecheck

```bash
npx tsc --noEmit
```

### Formatting

- **TypeScript / React:** Match existing style in `src/` (Prettier is not
  enforced yet; keep diffs focused and consistent with neighboring files).
- **Rust:** Prefer `cargo fmt` before submitting Rust changes:

```bash
cd src-tauri && cargo fmt
```

### Testing

```bash
npm test
```

Add or update tests next to the code you change when behavior is non-trivial
(especially `src/scanner/`, `src/import-export/`, `src/git-native/`, and utils).

## Commit message convention

Use concise, imperative commit messages. Prefer a Conventional Commits-style
prefix:

```text
feat: add WebSocket message templates
fix: prevent empty environment overwrite
docs: expand git-native guide
chore: bump version to 0.1.2
test: cover Go gin route scanner
refactor: simplify request auth merge
ci: tighten release artifact names
```

Keep the subject under ~72 characters. Use the body for why, not what.

## Pull request checklist

Before opening a PR:

- [ ] Branched from the latest `main`
- [ ] Change is focused (one concern per PR when practical)
- [ ] `npm test` passes
- [ ] Typecheck passes (`npx tsc --noEmit`) if you touched TypeScript
- [ ] Rust changes build (`cargo check` in `src-tauri/`)
- [ ] Docs updated if behavior or public APIs changed
- [ ] No secrets, tokens, or personal data committed
- [ ] PR description explains motivation and testing

Use the pull request template when prompted.

## Issue reporting

Use GitHub Issue Forms:

- **Bug report** — unexpected behavior with repro steps
- **Feature request** — proposed capability and use case
- **Documentation** — gaps or errors in docs

Include OS, Fishman version (or commit), and a minimal reproduction when
reporting bugs.

Security vulnerabilities must **not** be filed as public issues. See
[SECURITY.md](SECURITY.md).

## Coding guidelines

See [docs/code-style.md](docs/code-style.md) for naming, folder layout, and
language-specific conventions.

High-level rules:

1. Prefer small, readable changes over large rewrites.
2. Match existing patterns in `src/` and `src-tauri/`.
3. Do not add dependencies without a clear need.
4. Keep UI consistent with the current design system (Tailwind + shadcn/ui).
5. Do not commit generated `target/`, `dist/`, or `node_modules/`.

## Folder structure

```text
src/                 React frontend (UI, store, services, scanner, …)
src-tauri/           Rust / Tauri backend (HTTP, SQLite, IPC commands)
docs/                Project documentation
.github/             CI, issue/PR templates, Dependabot
public/              Static assets
```

## Review process

1. Open a draft PR early for large work if you want feedback.
2. Maintainers review for correctness, UX consistency, tests, and scope.
3. Address review comments with follow-up commits (or amend if preferred).
4. Once approved and CI is green, a maintainer merges.

## Large feature proposal process

For substantial features (new protocol support, major UI redesigns, storage
format changes):

1. Open a **GitHub Discussion** (Ideas) or a Feature Request issue first.
2. Describe the problem, proposed approach, alternatives, and impact on
   existing users / Git-native format.
3. Wait for maintainer feedback before implementing a large PR.
4. Split implementation into reviewable PRs when possible.

## License

Contributions are accepted under the [Apache License 2.0](LICENSE). Unless you
explicitly state otherwise, any contribution intentionally submitted for
inclusion in Fishman is under the same license, without additional terms.

## Trademark

Please respect the Fishman trademark policy in [docs/branding.md](docs/branding.md)
and the README. Forks may use the Apache-2.0 licensed code but must not imply
official endorsement through the Fishman name or logo.
