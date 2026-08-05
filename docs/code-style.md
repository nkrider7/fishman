# Code style

Conventions for Fishman contributions. When in doubt, match neighboring code.

## Naming conventions

| Kind | Convention | Example |
|------|------------|---------|
| React components | PascalCase | `RequestBuilder.tsx` |
| Hooks | `use` + camelCase | `useKeyboardShortcuts.ts` |
| Utilities | camelCase | `formatDuration.ts` |
| Types / interfaces | PascalCase | `WsMessage` |
| Redux slices | camelCase + `Slice` | `websocketSlice.ts` |
| Constants | SCREAMING_SNAKE or camel | Prefer existing file style |
| Rust modules | snake_case | `websocket.rs` |
| Rust types | PascalCase | `WsSession` |
| IPC command names | snake_case | `send_http_request` |

## Folder structure

- Feature UI under `src/components/<feature>/`
- Shared UI primitives under `src/components/ui/`
- Domain types under `src/types/`
- Side-effectful orchestration under `src/services/` or thunks
- Tauri invoke wrappers only under `src/tauri/`
- Do not dump new top-level folders without discussion

## React conventions

- Function components only
- Prefer controlled inputs consistent with existing forms
- Keep components focused; extract subcomponents when files grow large
- Follow existing Redux patterns (slices + thunks + selectors)
- Avoid introducing new global state libraries
- Accessibility: preserve labels, keyboard paths, and focus behavior
- Styling: Tailwind utility classes; reuse shadcn/ui patterns already in-tree
- Do not add `useMemo` / `useCallback` by default unless the codebase pattern
  nearby already does

## TypeScript conventions

- Prefer explicit domain types in `src/types/`
- Avoid `any`; use `unknown` and narrow
- Prefer discriminated unions for request kinds (REST / GraphQL / WebSocket)
- Keep public function signatures readable; infer locals when obvious
- Colocate unit tests as `*.test.ts` next to the module

## Rust conventions

- Run `cargo fmt` before submitting
- Prefer idiomatic error handling (`Result`, clear error messages to the UI)
- Keep command handlers thin; push logic into modules
- Do not expand Tauri capabilities beyond what the feature requires
- Match existing module organization in `src-tauri/src/`

## Git & commits

- Focused diffs; no drive-by reformatting
- Conventional-style commit prefixes (`feat:`, `fix:`, `docs:`, …)
- Never commit secrets, `.env`, or `*.secret.json`

## Documentation

- Use clear Markdown; prefer tables for comparisons
- Update [CHANGELOG.md](../CHANGELOG.md) for user-visible changes
- Link related docs instead of duplicating long explanations

See also [architecture.md](architecture.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).
