# Margin Reader

Margin Reader is a local-first EPUB reader for Apple Silicon Macs. The app is built with Electron 43, Electron Forge, React 19, Vite, strict TypeScript, SQLite FTS5, and a sandboxed preload bridge.

Books, reading progress, highlights, notes, conversations, and the offline search index live under Electron’s macOS `userData` directory. Imported EPUBs are copied into managed storage. No account, hosted database, object store, or browser session is used.

## Requirements

- macOS 12 or newer on Apple Silicon
- Node.js 20.9 or newer
- pnpm 10.21.0

## Development

```sh
pnpm install
pnpm dev
```

Useful checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm package
pnpm make
```

`pnpm db:seed` rebuilds the deterministic Alice EPUB fixture. `pnpm db:migrate` initializes a development SQLite library in `.margin-reader-dev` unless `MARGIN_READER_USER_DATA` is set.

## Local data and privacy

The app stores:

```text
<userData>/library.sqlite
<userData>/books/<book-id>/original.epub
<userData>/credentials.bin
```

SQLite uses WAL mode, foreign keys, a five-second busy timeout, transactional schema setup, and pre-migration backups. Search uses FTS5 with normalized Latin terms and overlapping CJK bigrams. Spoiler scope is applied in SQL before BM25 ranking; at most eight bounded excerpts are sent to Gemini.

Gemini is optional. Users provide their own Google AI API key in Settings. The key is encrypted with Electron `safeStorage`, which is backed by macOS Keychain, and plaintext fallback is refused. Reading, search, progress, highlights, and note export work without a key.

## Desktop security

- Renderer sandbox enabled, Node integration disabled, context isolation enabled.
- Typed `window.marginReader` API; raw IPC is never exposed.
- Secure standard `margin-reader://app` protocol with traversal checks and SPA fallback.
- Publication scripts, forms, frames, remote media, permissions, popups, and unexpected navigation are blocked.
- EPUB entry count, expanded size, path traversal, CRC, compressed-ratio, and HTML sanitization checks are enforced.
- Electron fuses require ASAR integrity and disable `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and CLI inspection.

## Distribution

Forge creates arm64 DMG and ZIP artifacts. Normal releases must be signed with Developer ID, notarized, and stapled. Tagged pushes run `.github/workflows/release.yml`, which validates the project, imports the signing certificate, builds and notarizes the app, notarizes/staples the DMG, publishes a draft GitHub Release, and performs `codesign` and Gatekeeper checks.

Required repository secrets:

- `APPLE_DEVELOPER_ID_CERTIFICATE`
- `APPLE_DEVELOPER_ID_CERTIFICATE_PASSWORD`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_API_PRIVATE_KEY`
