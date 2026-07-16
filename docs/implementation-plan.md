# Desktop implementation status

Margin Reader now targets Electron on Apple Silicon macOS and no longer contains the hosted Next.js, PostgreSQL, Vercel Blob, or cookie-session application paths.

Implemented foundations include the secure custom protocol, sandboxed preload API, SQLite/FTS repository, restart-safe deduplicated EPUB ingestion, local progress/highlights/conversations/settings, Keychain-backed Google credentials, bounded spoiler-aware retrieval, streaming cancellation, native menus, note export, Forge packaging, Electron fuses, GitHub publishing, signed ZIP updates, and a signed/notarized DMG release workflow.

Before a public beta, run the complete acceptance suite on a clean macOS 12 Apple Silicon machine and validate update installation from the previous beta tag.
