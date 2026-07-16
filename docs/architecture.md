# Desktop architecture

The renderer is an unprivileged React/Vite SPA served from `margin-reader://app`. A sandboxed preload exposes a narrow, Zod-validated API. The main process validates every top-level sender, owns native menus, custom protocol handling, dialogs, Keychain-backed credential encryption, and updates.

Database, EPUB ingestion, FTS retrieval, and Gemini network work run in one Electron utility process. Main-to-utility requests use a private message port. The renderer never receives filesystem paths, SQLite handles, raw IPC, or decrypted credentials.

## Data flow

```text
Renderer → typed preload → validating main process → utility process → SQLite/files
                                                        ↓
                                                   Gemini (optional)
```

Imports are copied to managed storage and hashed with SHA-256. An existing hash focuses the existing record. Parsing writes chapters, blocks, and chunks transactionally after clearing retryable child rows. Interrupted non-terminal imports are resumed at launch.

FTS5 indexes normalized text and headings. Latin text is NFKC-normalized and lowercased; CJK runs add overlapping bigrams. Spoiler predicates constrain SQL candidates before BM25 ranking and location/phrase boosts. The final prompt contains only instructions, the user question, allowed bounded conversation context, and up to eight excerpts.

The ingestion state machine is:

```text
uploaded → parsing → chunking → indexing → ready
                                      ↘ failed
```

Credential material is encrypted with `safeStorage` into `credentials.bin`. It is decrypted only in main and transferred directly to utility memory for a request. It is never included in a prompt, database row, or renderer message.
