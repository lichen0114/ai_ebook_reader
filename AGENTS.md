# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 16 App Router project in strict TypeScript. Pages and API handlers live in `src/app`; React views are grouped by feature in `src/components`. Domain code belongs in `src/lib`, with modules for AI, books, database access, reader adapters, storage, validation, and authentication. Keep unit tests beside source as `*.test.ts`. Integration, smoke, and browser tests live under `tests/integration`, `tests/smoke`, and `tests/e2e`. Migrations are in `drizzle`, scripts in `scripts`, architecture notes in `docs`, and assets in `public`.

## Build, Test, and Development Commands

- `pnpm install` installs dependencies (Node.js 20.9+ and pnpm 10 required).
- `pnpm dev` starts the local app; open `/library`.
- `pnpm lint` runs Next.js ESLint rules with zero warnings allowed.
- `pnpm typecheck` checks strict TypeScript without emitting files.
- `pnpm test` runs deterministic Vitest tests; `pnpm test:watch` supports iteration.
- `pnpm test:e2e` runs Playwright desktop and mobile flows.
- `pnpm build` creates the production Next.js build.
- `pnpm db:migrate` applies Drizzle migrations; `pnpm db:seed` restores the Alice EPUB fixture.

## Coding Style & Naming Conventions

Follow the ESLint and TypeScript configuration. Use two-space indentation, double quotes, semicolons, named exports for shared utilities, and the `@/` alias for `src` imports. Name components and types in PascalCase, functions and variables in camelCase, and files/routes in lowercase kebab-case. Keep secrets and database work out of client components. Validate external input with Zod.

## Testing Guidelines

Use Vitest for logic and route tests and Playwright for end-to-end behavior. Name files `*.test.ts` or, for credentialed smoke coverage, `*.smoke.ts`. Add regression tests with behavior changes. Normal tests must remain deterministic and must not call paid AI services. Run lint, typecheck, and unit tests before submitting; run E2E tests for reader or UI changes.

## Commit & Pull Request Guidelines

History uses concise Conventional Commit subjects such as `feat:` and `refactor:`; continue with imperative, scoped summaries. Pull requests should explain the user-visible change, list verification commands, link related issues, and include screenshots for UI changes. Call out migrations, new environment variables, or security-sensitive parsing/auth changes explicitly.

## Security & Configuration

Copy `.env.example` to `.env.local`; never commit credentials. Do not expose database, Google AI, Blob, or session secrets through `NEXT_PUBLIC_*`. Treat EPUB uploads as untrusted content and preserve the existing archive limits, sanitization, ownership checks, and deterministic no-key fallback.
