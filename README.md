# Margin Reader

Margin Reader is a typography-first EPUB reader with a temporary, evidence-backed AI margin. The book remains the dominant surface: select a difficult passage, get a concise cited answer, jump to the exact evidence, then return to the previous reading location.

The repository contains a deployable Next.js vertical slice, a redistributable public-domain EPUB fixture, deterministic AI behavior for local review/tests, PostgreSQL/pgvector migrations, secure EPUB parsing, and automated browser coverage of the complete demo loop.

## What works

- Editorial library with a seeded *Alice’s Adventures in Wonderland* EPUB and upload/processing states.
- Dynamically loaded EPUB.js renderer with scripted content disabled, unsafe DOM stripped, paginated reading, TOC navigation, keyboard page turns, and exact CFI restoration.
- Serif/sans type, font size, line height, reading width, light/paper/dark themes, and paginated/continuous modes.
- Anchored selection toolbar for Highlight, Note, Explain, Define, Translate, Ask, and Example-ready server action support.
- Persistent local highlights/notes plus session-scoped API records, exact CFI/quote anchors, workspace navigation, deletion, and Markdown/JSON export.
- AI SDK v7 `useChat` + `DefaultChatTransport` client and a Route Handler using validated `ReaderUIMessage` parts, request-level reader context, `streamText`, and the direct Google Generative AI provider.
- Typed retrieval, scope, source, and warning data parts. Inline citation buttons navigate to evidence and expose “Back to answer.”
- Retrieval predicates that enforce selection, chapter, read-so-far, and whole-book boundaries before ranking. Restricted history drops prior whole-book/later-citing answers.
- Deterministic streamed demo answers when credentials are absent. The seeded later-chapter “Bill” question demonstrates spoiler-safe refusal.
- Upload limits, archive traversal/expanded-size/entry-count checks, HTML sanitization, signed anonymous sessions, ownership checks, rate limiting, and restrictive CSP.

## Local setup

Requirements: Node.js 20.9+ (Node 22 is used in CI/local verification), pnpm 10+, and PostgreSQL with pgvector for database-backed setup.

```bash
pnpm install
cp .env.example .env.local
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000/library](http://localhost:3000/library). `pnpm db:seed` always creates `public/books/alice.epub`. Without `DATABASE_URL`, the application uses its deterministic local/demo repository and browser persistence; no AI key is required.

For PostgreSQL:

```bash
createdb margin_reader
# Set DATABASE_URL in .env.local, then:
pnpm db:migrate
pnpm db:seed
```

The migration enables `vector` and creates a `vector(1536)` column. Startup configuration rejects a different `EMBEDDING_DIMENSION`, preventing silent model/schema drift.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | Pooled PostgreSQL URL with pgvector |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Live AI only | Enables direct Gemini answers; otherwise deterministic demo mode |
| `AI_CHAT_MODEL` | No | Google provider-local model ID; default `gemini-3.1-flash-lite` |
| `AI_EMBEDDING_MODEL` | No | Central embedding model; default `openai/text-embedding-3-small` |
| `AI_RERANK_MODEL` | No | Reserved optional reranker model ID |
| `BLOB_READ_WRITE_TOKEN` | Production uploads | Enables the Vercel Blob adapter; otherwise files use `public/uploads` |
| `MAX_UPLOAD_BYTES` | No | Upload limit; default 52,428,800 |
| `NEXT_PUBLIC_APP_URL` | No | Canonical local/deployed URL |
| `SESSION_SECRET` | Production | At least 32 random characters for anonymous-session HMAC signing |
| `EMBEDDING_DIMENSION` | No | Must remain `1536` for this migration |
| `EMBEDDING_BATCH_SIZE` | No | Explicit embedding batch size, default 32 |

Direct Google model IDs omit the Vercel AI Gateway `google/` prefix. Never expose Google AI, Blob, database, or session secrets through `NEXT_PUBLIC_*` variables; Gemini requests are made only by the server-side chat route.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
GOOGLE_GENERATIVE_AI_API_KEY=... pnpm test:smoke:google
pnpm db:migrate
pnpm db:seed
```

The normal test suite never calls a paid model. Tests, missing-key runs, and requests with the explicit demo header use the deterministic streamed response path, so UI and citation assertions remain stable. The credentialed Google smoke test is opt-in and excluded from normal CI.

## Architecture

- `src/lib/reader`: format-independent locators and renderer contract; EPUB.js is one adapter.
- `src/lib/books`: secure archive/parser/sanitizer/chunker and seeded publication data.
- `src/lib/ai`: typed UI messages, strict instructions, scope/history filters, hybrid score merging, and citation validation.
- `src/lib/db`: Drizzle schema for sessions, publications, structured blocks/chunks, progress, highlights, conversations, usage, FTS, and pgvector.
- `src/lib/storage`: local and Vercel Blob implementations behind `ObjectStore`.
- `src/app/api`: owner-scoped upload, bounded/resumable processing, progress/highlight, deletion, and AI stream endpoints.
- `tests`: Vitest unit/integration coverage and Playwright desktop/mobile flows.

See [docs/architecture.md](docs/architecture.md) and [docs/implementation-plan.md](docs/implementation-plan.md).

## Security assumptions

- Only DRM-free files the reader is authorized to process are supported. There is no DRM circumvention.
- EPUBs are untrusted: archive paths and size expansion are validated, executable/form/frame content is stripped, remote links are neutralized, and EPUB.js scripted content is disabled.
- The CSP permits `blob:` only where EPUB.js needs local document/style blobs. Remote trackers and arbitrary publication scripts remain blocked.
- AI receives only bounded, permitted excerpts—not an entire book. Production logging should contain IDs, counts, timing, model/action/scope, and token usage, never book text or prompts.
- Anonymous sessions are an adapter boundary, not a substitute for account recovery or multi-device identity.

## Deploy to Vercel

1. Provision pooled PostgreSQL with pgvector and run `pnpm db:migrate` against it.
2. Create a Vercel Blob store.
3. Import the repository into Vercel; use the default Next.js build command (`pnpm build`).
4. Configure `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, a strong `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, and optionally `AI_CHAT_MODEL` in Project Settings.
5. Run `pnpm db:seed` once against the production database, then deploy the review environment.

`GOOGLE_GENERATIVE_AI_API_KEY` is required for live Gemini calls. Without it, the deployment remains usable in deterministic grounded-answer mode.

## Known limitations

- The current API repository is process-local even when `DATABASE_URL` is configured; browser progress/highlights remain durable across reloads and Blob can preserve files, but uploaded metadata is not durable across a server instance restart. The Drizzle schema/migration is complete and verified, but the API repository still needs to be switched from `serverRepository` to Drizzle before a multi-instance production rollout.
- The migration and ingestion primitives support FTS/pgvector storage, while this vertical slice’s seeded deterministic retrieval uses curated fixture chunks. Live uploaded-book embedding persistence, SQL hybrid retrieval, optional reranking, and durable AI message/usage writes are the next production-hardening step. Until then, the Vercel deployment is a review/demo deployment, not production data durability.
- Highlight notes can be created and deleted/exported; inline editing after creation is not yet exposed.
- The EPUB parser bounds total expansion and entry count; a production hardening pass should additionally inspect compressed-size ratios before expanding every entry.
- PDF, OCR, PWA/offline, TTS, and account-based sync are intentionally outside this P0 EPUB slice.
