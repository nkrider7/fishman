# Roadmap

This roadmap is a living document. Priorities may shift based on user feedback
and contributor capacity. For proposals, open a
[GitHub Discussion](https://github.com/nkrider7/fishman/discussions) or a
feature request issue.

## In progress

| Item | Notes |
|------|--------|
| WebSocket client polish | Timeline filters, templates, reliability |
| Scanner coverage | Rust / Go frameworks; more edge cases |
| Git-native UX | Conflicts, large workspaces, search |
| Docs & open-source process | Templates, architecture, release hygiene |

## Planned

| Item | Notes |
|------|--------|
| OpenAPI / Swagger import | Generate collections from specs |
| Bruno / Insomnia / HAR / cURL import | Broader migration paths |
| macOS release artifacts | CI packaging + notarization later |
| GraphQL subscriptions | Over the WebSocket client |
| Collection documentation polish | HTML / share flows |
| Authenticode / code signing | Windows / macOS trust |

## Completed

| Item | Notes |
|------|--------|
| REST request builder & response viewer | Core workspace |
| Environments & `{{variables}}` | Global + collection scope |
| Postman import / export | Migration path |
| Project scanner (Node, Python, Java, …) | Local folder + GitHub URL |
| Git-native collections | `fishman/**/*.fish` |
| GraphQL HTTP client | Query / vars / introspection |
| WebSocket first-class requests | Connect / messages / composer |
| Linux + Windows GitHub Releases | AppImage, deb, NSIS, MSI |
| Apache-2.0 open-source packaging | License, community docs |
| Find & Replace URLs | Bulk origin replace with preview + undo |

## Ideas

These are not committed; discuss before large implementation:

- Theme marketplace / community themes
- Collection sharing beyond Git (links, embeds)
- Scripting / pre-request hooks
- gRPC support
- Mock server generation from collections
- PHP / C# / Ruby language scanners
- Mobile companion or lightweight CLI
- Telemetry that is opt-in only (privacy-preserving)

## How to influence the roadmap

1. Use Fishman and file focused bug reports
2. Upvote / comment on existing feature issues
3. Open an Ideas discussion for larger proposals
4. Contribute a PR or plugin aligned with [CONTRIBUTING.md](../CONTRIBUTING.md)
