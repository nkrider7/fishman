# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-08-16

### Added

- Find & Replace URLs sidebar panel (select text + `Ctrl/Cmd+Shift+H`)
- Ko-fi support in About / Settings and on the project README
- Apache License 2.0, Code of Conduct, security policy, contributing guide, and GitHub community templates

### Changed

- Release pipeline: auto-tag on version bump, GitHub Release notes from this changelog, grouped monthly Dependabot
- Package metadata (license, author, repository, homepage)

## [0.1.1] - 2026-07-29

### Added

- WebSocket request type with session panel, message composer, and templates
- GraphQL query / variables / operation editors and introspection docs
- Project scanner support for Rust (Actix Web, Axum) and Go (Gin, Echo, Chi, net/http)
- Git-native collections and workspace sync
- Documentation HTML generation and share / export flows
- Terminal tooling improvements (xterm session)

### Changed

- Release workflow and version bump to 0.1.1
- CI typecheck and test fixture coverage

### Fixed

- Typecheck errors that blocked CI
- Git-native secret fixture inclusion for CI

## [0.1.0] - 2026-07-19

### Added

- Initial public application: Tauri v2 + React API client
- REST request builder and response viewer
- Collections, environments, history, and cookies
- Postman import / export
- Project scanner for major Node, Python, and Java frameworks
- Linux and Windows GitHub Actions release pipeline

[Unreleased]: https://github.com/nkrider7/fishman/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/nkrider7/fishman/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/nkrider7/fishman/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/nkrider7/fishman/releases/tag/v0.1.0
