# Architecture

## Request and reading flow

```text
EPUB / ObjectStore
        │
        ▼
PublicationRenderer ── relocation/selection ──► Reader shell
        │                                          │
        │                                  request-scoped context
        │                                          ▼
 citation locator ◄── typed sources ── /api/reader/chat
        │                                          │
        └── Back to answer                  scope filter → retrieval
                                                   │
                                          deterministic demo or
                                          direct Gemini streamText
```

The reader owns navigation and typography. AI state is isolated in the temporary margin so token streaming does not rerender the EPUB iframe.

## Durable location model

`PublicationLocator` is a format union. EPUB locators retain resource href, spine index, block index, progression, CFI where available, and an exact/prefix/suffix quote anchor. CFI is the first navigation choice; quote context and structured block position provide repair/fallback semantics. No DOM node or raw character-offset identity is stored.

## Spoiler boundary

Scope is a retrieval constraint, not a prompt preference. `read_so_far` permits only:

```sql
spine_index < :current_spine
OR (spine_index = :current_spine AND end_block_index <= :current_block)
```

Conversation filtering separately removes whole-book assistant turns and any answer citing beyond the active position. Whole-book mode requires a visible warning and is labeled on its answer.

## Ingestion state machine

```text
uploaded → parsing → chunking → embedding → ready
              └──────── recoverable failure ───────► failed
```

Each process request advances one bounded stage. Status guards make retries idempotent, and database uniqueness on `(book_id, spine_index, block_index)` and `(book_id, ordinal)` prevents duplicate blocks/chunks. Parsing is usable before embeddings finish, allowing selection-only assistance during indexing.

## AI protocol

The UI message type parameterizes both metadata and these custom data parts:

- `data-retrieval`: searching/reranking/ready/failed and candidate count.
- `data-scope`: active scope and spoiler risk.
- `data-sources`: exact citations with locators.
- `data-warning`: recoverable groundedness/provider warnings.

The client transport contains only the static endpoint. Every `sendMessage` supplies current scope, locator, spine/block position, selection, language, action, and thread at request time. The server validates the entire request and UI-message history before converting messages for `streamText`.

## Storage and identity

Signed anonymous cookies are the current auth adapter. All mutable API paths combine session and book identity for authorization. `ObjectStore` selects Vercel Blob with a token or a local filesystem store in development. Neither storage-write credentials nor AI credentials enter client bundles.

## Database

Drizzle models sessions, books, chapters, blocks, chunks, progress, highlights, threads/messages, and AI usage. JSONB carries locators and message parts. `book_chunks.search_text` is generated PostgreSQL FTS data, and `embedding vector(1536)` has an HNSW cosine index. Configuration validates the dimension at runtime against the migration constant.
