# Margin Reader implementation plan

## Product slice

Build a book-first EPUB reading experience whose primary loop is reading, selecting a difficult passage, receiving a short grounded answer in a temporary margin, opening the exact evidence, and returning to the previous location.

The visual direction is an editorial reading room: warm neutral paper, compact sans-serif controls, a literary serif reading face, restrained indigo accents, and no persistent AI chrome.

## Architecture

- Next.js App Router with strict TypeScript and Tailwind CSS.
- A signed anonymous session cookie behind an auth adapter owns every user record.
- Drizzle/PostgreSQL schema with pgvector and a checked 1,536-dimension embedding column. SQL migrations remain the deployment source of truth; the app can run in a deterministic local-demo repository when `DATABASE_URL` is absent.
- Object storage is hidden behind `ObjectStore`, with local filesystem and Vercel Blob adapters.
- EPUB rendering is hidden behind `PublicationRenderer`; the browser adapter dynamically loads `epubjs` and reports relocations, selections, and TOC state.
- Upload processing is a bounded, resumable state machine: validate/archive, parse, structure/chunk, then embed. Batch keys and database uniqueness constraints make retries idempotent.
- Retrieval applies the scope predicate before deterministic hybrid ranking. Selection context is injected directly; full-text and vector ranks are merged and optionally reranked.
- AI SDK UI uses `useChat<ReaderUIMessage>` and `DefaultChatTransport`. Mutable reader context is supplied per `sendMessage`. The route validates both the request and UI messages, streams typed retrieval/scope/source/warning parts, and uses a deterministic model path without credentials.
- Citations carry format-independent locators and quote anchors. Navigation stores a return locator before opening evidence.

## Delivery order

1. Configuration, schema/migrations, auth, storage, seed repository.
2. Library, upload flow, processing states.
3. EPUB renderer, TOC, progress, appearance, responsive reader shell.
4. Selection toolbar, persistent highlights/notes, workspace/export.
5. Secure EPUB parser, block extraction, structured chunking.
6. Scope filters, hybrid retrieval, citation validation and tests.
7. Typed AI SDK streaming route/client, citation navigation.
8. Accessibility/responsive polish, unit/integration/E2E tests, production build, docs.

## Verification gates

- lint and strict typecheck
- Vitest unit/integration suite
- Playwright core reading flow
- Drizzle migration/seed validation where PostgreSQL is available
- Next.js production build

## Constraints and graceful degradation

- Without a database, seeded demo data and mutations use the local demo repository so the complete reader flow remains reviewable.
- Without an AI Gateway key, deterministic grounded answers stream from the same endpoint and typed protocol.
- Uploaded files are DRM-free only. Remote EPUB resources and executable content are blocked.
