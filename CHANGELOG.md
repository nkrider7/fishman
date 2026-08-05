# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Apache License 2.0 and open-source project documentation
- Contributor Covenant Code of Conduct
- Security policy, contributing guide, and GitHub community templates

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

[Unreleased]: https://github.com/nkrider7/fishman/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/nkrider7/fishman/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/nkrider7/fishman/releases/tag/v0.1.0
