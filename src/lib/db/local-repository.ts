import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parseEpub, type ParsedEpub } from "@/lib/books/epub-parser";
import { normalizeSearchText, toFtsQuery } from "@/lib/ai/retrieve";
import type { ReaderScope } from "@/lib/ai/types";
import type { Conversation, Highlight, LocalBook, LocalCitation, ReadingProgress } from "@/shared/ipc";

const DATABASE_VERSION = 1;
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

const MIGRATION = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, title TEXT NOT NULL, author TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en', description TEXT NOT NULL DEFAULT '', original_relative_path TEXT NOT NULL,
  status TEXT NOT NULL, processing_progress INTEGER NOT NULL DEFAULT 0, processing_error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, spine_index INTEGER NOT NULL,
  href TEXT NOT NULL, title TEXT NOT NULL, start_block_index INTEGER NOT NULL, end_block_index INTEGER NOT NULL,
  UNIQUE(book_id, spine_index)
);
CREATE TABLE IF NOT EXISTS book_blocks (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE, spine_index INTEGER NOT NULL,
  block_index INTEGER NOT NULL, block_type TEXT NOT NULL, heading_path TEXT NOT NULL, text TEXT NOT NULL,
  locator TEXT NOT NULL, UNIQUE(book_id, spine_index, block_index)
);
CREATE TABLE IF NOT EXISTS book_chunks (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL,
  spine_index INTEGER NOT NULL, start_block_index INTEGER NOT NULL, end_block_index INTEGER NOT NULL,
  heading_path TEXT NOT NULL, text TEXT NOT NULL, normalized_text TEXT NOT NULL, locator_start TEXT NOT NULL,
  locator_end TEXT NOT NULL, token_count INTEGER NOT NULL, UNIQUE(book_id, ordinal)
);
CREATE INDEX IF NOT EXISTS chunks_scope_idx ON book_chunks(book_id, spine_index, end_block_index);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunk_id UNINDEXED, book_id UNINDEXED, heading, text, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS reading_progress (
  book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE, locator TEXT NOT NULL, spine_index INTEGER NOT NULL,
  block_index INTEGER NOT NULL, percentage REAL NOT NULL, settings TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, exact TEXT NOT NULL,
  prefix TEXT NOT NULL, suffix TEXT NOT NULL, color TEXT NOT NULL, locator TEXT NOT NULL, note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS highlights_book_idx ON highlights(book_id);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, title TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE, role TEXT NOT NULL,
  text TEXT NOT NULL, action TEXT, scope TEXT, citations TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, model TEXT NOT NULL,
  action TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, latency_ms INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
`;

type Row = Record<string, string | number | null>;

export type SearchResult = { citation: LocalCitation; text: string; score: number };

export class LocalRepository {
  readonly db: Database.Database;
  readonly userDataPath: string;

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath;
    mkdirSync(userDataPath, { recursive: true });
    mkdirSync(path.join(userDataPath, "books"), { recursive: true });
    const databasePath = path.join(userDataPath, "library.sqlite");
    const databaseOptions = process.env.MARGIN_READER_SQLITE_BINDING ? { nativeBinding: process.env.MARGIN_READER_SQLITE_BINDING } : undefined;
    this.db = new Database(databasePath, databaseOptions);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    const currentVersion = this.db.pragma("user_version", { simple: true }) as number;
    if (currentVersion < DATABASE_VERSION) {
      this.db.close();
      if (existsSync(databasePath)) copyFileSync(databasePath, `${databasePath}.pre-migration-${Date.now()}.bak`);
      this.db = new Database(databasePath, databaseOptions);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("busy_timeout = 5000");
      this.db.transaction(() => {
        this.db.exec(MIGRATION);
        this.db.pragma(`user_version = ${DATABASE_VERSION}`);
      })();
    } else {
      this.db.exec(MIGRATION);
    }
  }

  close() { this.db.close(); }

  listBooks(): LocalBook[] {
    return (this.db.prepare("SELECT * FROM books ORDER BY COALESCE((SELECT updated_at FROM reading_progress WHERE book_id = books.id), books.created_at) DESC").all() as Row[])
      .map((row) => this.mapBook(row));
  }

  getBook(id: string): LocalBook | null {
    const row = this.db.prepare("SELECT * FROM books WHERE id = ?").get(id) as Row | undefined;
    return row ? this.mapBook(row) : null;
  }

  private mapBook(row: Row): LocalBook {
    const chapters = this.db.prepare("SELECT id, title, href, spine_index FROM chapters WHERE book_id = ? ORDER BY spine_index").all(row.id) as Row[];
    const progress = this.db.prepare("SELECT percentage, updated_at FROM reading_progress WHERE book_id = ?").get(row.id) as Row | undefined;
    return {
      id: String(row.id), title: String(row.title), author: String(row.author), language: String(row.language),
      description: String(row.description ?? ""), status: row.status as LocalBook["status"], processingProgress: Number(row.processing_progress),
      processingError: row.processing_error === null ? null : String(row.processing_error), progress: Number(progress?.percentage ?? 0),
      lastRead: progress ? String(progress.updated_at) : null, originalUrl: `margin-reader://app/books/${row.id}/original.epub`,
      chapters: chapters.map((chapter) => ({ id: String(chapter.id), label: String(chapter.title), href: String(chapter.href), spineIndex: Number(chapter.spine_index) }))
    };
  }

  async importFile(sourcePath: string, onProgress?: (book: LocalBook) => void): Promise<LocalBook> {
    const source = readFileSync(sourcePath);
    if (!source.byteLength || source.byteLength > MAX_IMPORT_BYTES) throw new Error("EPUB files must be between 1 byte and 50 MB.");
    const hash = createHash("sha256").update(source).digest("hex");
    const existing = this.db.prepare("SELECT * FROM books WHERE sha256 = ?").get(hash) as Row | undefined;
    if (existing) return this.mapBook(existing);
    const id = randomUUID();
    const now = new Date().toISOString();
    const bookDirectory = path.join(this.userDataPath, "books", id);
    mkdirSync(bookDirectory, { recursive: true });
    writeFileSync(path.join(bookDirectory, "original.epub"), source, { mode: 0o600 });
    this.db.prepare("INSERT INTO books (id, sha256, title, author, language, original_relative_path, status, processing_progress, created_at, updated_at) VALUES (?, ?, ?, ?, 'en', ?, 'uploaded', 5, ?, ?)")
      .run(id, hash, path.basename(sourcePath).replace(/\.epub$/i, "") || "Untitled", "Reading metadata…", `books/${id}/original.epub`, now, now);
    onProgress?.(this.getBook(id)!);
    return this.ingest(id, source, onProgress);
  }

  async resumeInterrupted(onProgress?: (book: LocalBook) => void) {
    const rows = this.db.prepare("SELECT id, original_relative_path FROM books WHERE status NOT IN ('ready', 'failed')").all() as Row[];
    for (const row of rows) {
      try {
        const bytes = readFileSync(path.join(this.userDataPath, String(row.original_relative_path)));
        await this.ingest(String(row.id), bytes, onProgress);
      } catch (error) {
        this.failBook(String(row.id), error);
      }
    }
  }

  private async ingest(id: string, source: Buffer, onProgress?: (book: LocalBook) => void) {
    try {
      this.updateStatus(id, "parsing", 20);
      onProgress?.(this.getBook(id)!);
      const bytes = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
      const parsed = await parseEpub(bytes);
      this.updateStatus(id, "chunking", 58);
      onProgress?.(this.getBook(id)!);
      this.persistParsed(id, parsed);
      this.updateStatus(id, "indexing", 86);
      onProgress?.(this.getBook(id)!);
      this.rebuildFts(id);
      this.db.prepare("UPDATE books SET title = ?, author = ?, language = ?, status = 'ready', processing_progress = 100, processing_error = NULL, updated_at = ? WHERE id = ?")
        .run(parsed.title, parsed.author, parsed.language, new Date().toISOString(), id);
      const book = this.getBook(id)!;
      onProgress?.(book);
      return book;
    } catch (error) {
      this.failBook(id, error);
      onProgress?.(this.getBook(id)!);
      throw error;
    }
  }

  private updateStatus(id: string, status: LocalBook["status"], progress: number) {
    this.db.prepare("UPDATE books SET status = ?, processing_progress = ?, processing_error = NULL, updated_at = ? WHERE id = ?")
      .run(status, progress, new Date().toISOString(), id);
  }

  private failBook(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : "The EPUB could not be processed.";
    this.db.prepare("UPDATE books SET status = 'failed', processing_progress = 0, processing_error = ?, updated_at = ? WHERE id = ?")
      .run(message.slice(0, 1_000), new Date().toISOString(), id);
  }

  private persistParsed(bookId: string, parsed: ParsedEpub) {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM chunks_fts WHERE book_id = ?").run(bookId);
      this.db.prepare("DELETE FROM chapters WHERE book_id = ?").run(bookId);
      let ordinal = 0;
      for (const chapter of parsed.chapters) {
        const chapterId = randomUUID();
        this.db.prepare("INSERT INTO chapters (id, book_id, spine_index, href, title, start_block_index, end_block_index) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(chapterId, bookId, chapter.spineIndex, chapter.href, chapter.title, chapter.blocks[0]?.blockIndex ?? 0, chapter.blocks.at(-1)?.blockIndex ?? 0);
        for (const block of chapter.blocks) {
          const locator = { type: "epub", href: chapter.href, spineIndex: chapter.spineIndex, blockIndex: block.blockIndex };
          this.db.prepare("INSERT INTO book_blocks (id, book_id, chapter_id, spine_index, block_index, block_type, heading_path, text, locator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(randomUUID(), bookId, chapterId, chapter.spineIndex, block.blockIndex, block.blockType, JSON.stringify(block.headingPath), block.text, JSON.stringify(locator));
        }
        for (const chunk of chapter.chunks) {
          const start = { type: "epub", href: chapter.href, spineIndex: chapter.spineIndex, blockIndex: chunk.startBlockIndex };
          const end = { ...start, blockIndex: chunk.endBlockIndex };
          this.db.prepare("INSERT INTO book_chunks (id, book_id, chapter_id, ordinal, spine_index, start_block_index, end_block_index, heading_path, text, normalized_text, locator_start, locator_end, token_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(randomUUID(), bookId, chapterId, ordinal++, chapter.spineIndex, chunk.startBlockIndex, chunk.endBlockIndex, JSON.stringify(chunk.headingPath), chunk.text, normalizeSearchText(chunk.text), JSON.stringify(start), JSON.stringify(end), chunk.tokenCount);
        }
      }
    })();
  }

  private rebuildFts(bookId: string) {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM chunks_fts WHERE book_id = ?").run(bookId);
      const chunks = this.db.prepare("SELECT id, heading_path, normalized_text FROM book_chunks WHERE book_id = ?").all(bookId) as Row[];
      const insert = this.db.prepare("INSERT INTO chunks_fts (chunk_id, book_id, heading, text) VALUES (?, ?, ?, ?)");
      for (const chunk of chunks) insert.run(chunk.id, bookId, normalizeSearchText(JSON.parse(String(chunk.heading_path)).join(" ")), chunk.normalized_text);
    })();
  }

  deleteBook(id: string) {
    const result = this.db.prepare("DELETE FROM books WHERE id = ?").run(id);
    if (result.changes) rmSync(path.join(this.userDataPath, "books", id), { recursive: true, force: true });
    return result.changes > 0;
  }

  getProgress(bookId: string): ReadingProgress | null {
    const row = this.db.prepare("SELECT * FROM reading_progress WHERE book_id = ?").get(bookId) as Row | undefined;
    if (!row) return null;
    return { bookId, locator: JSON.parse(String(row.locator)), spineIndex: Number(row.spine_index), blockIndex: Number(row.block_index), percentage: Number(row.percentage), updatedAt: String(row.updated_at), settings: row.settings ? JSON.parse(String(row.settings)) : undefined };
  }

  saveProgress(input: Omit<ReadingProgress, "updatedAt">): ReadingProgress {
    const updatedAt = new Date().toISOString();
    this.db.prepare("INSERT INTO reading_progress (book_id, locator, spine_index, block_index, percentage, settings, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET locator=excluded.locator, spine_index=excluded.spine_index, block_index=excluded.block_index, percentage=excluded.percentage, settings=COALESCE(excluded.settings, reading_progress.settings), updated_at=excluded.updated_at")
      .run(input.bookId, JSON.stringify(input.locator), input.spineIndex, input.blockIndex, input.percentage, input.settings ? JSON.stringify(input.settings) : null, updatedAt);
    return { ...input, updatedAt };
  }

  listHighlights(bookId: string): Highlight[] {
    return (this.db.prepare("SELECT * FROM highlights WHERE book_id = ? ORDER BY created_at DESC").all(bookId) as Row[]).map(mapHighlight);
  }

  createHighlight(input: Omit<Highlight, "createdAt" | "updatedAt">): Highlight {
    const now = new Date().toISOString();
    this.db.prepare("INSERT INTO highlights (id, book_id, exact, prefix, suffix, color, locator, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(input.id, input.bookId, input.exact, input.prefix, input.suffix, input.color, JSON.stringify(input.locator), input.note, now, now);
    return { ...input, createdAt: now, updatedAt: now };
  }

  updateHighlight(id: string, input: { note?: string | null; color?: string }): Highlight {
    const current = this.db.prepare("SELECT * FROM highlights WHERE id = ?").get(id) as Row | undefined;
    if (!current) throw new Error("Highlight not found.");
    this.db.prepare("UPDATE highlights SET note = ?, color = ?, updated_at = ? WHERE id = ?")
      .run(input.note === undefined ? current.note : input.note, input.color ?? current.color, new Date().toISOString(), id);
    return mapHighlight(this.db.prepare("SELECT * FROM highlights WHERE id = ?").get(id) as Row);
  }

  deleteHighlight(id: string) { return this.db.prepare("DELETE FROM highlights WHERE id = ?").run(id).changes > 0; }

  loadConversations(bookId: string): Conversation[] {
    const threads = this.db.prepare("SELECT * FROM threads WHERE book_id = ? ORDER BY updated_at DESC").all(bookId) as Row[];
    return threads.map((thread) => ({
      id: String(thread.id), bookId, title: String(thread.title), updatedAt: String(thread.updated_at),
      messages: (this.db.prepare("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at").all(thread.id) as Row[]).map((message) => ({
        id: String(message.id), role: message.role as "user" | "assistant", text: String(message.text),
        action: (message.action ?? undefined) as Conversation["messages"][number]["action"], scope: (message.scope ?? undefined) as Conversation["messages"][number]["scope"],
        citations: JSON.parse(String(message.citations)), createdAt: String(message.created_at)
      }))
    }));
  }

  saveConversation(conversation: Conversation): Conversation {
    const createdAt = conversation.messages[0]?.createdAt ?? conversation.updatedAt;
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO threads (id, book_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at")
        .run(conversation.id, conversation.bookId, conversation.title, createdAt, conversation.updatedAt);
      this.db.prepare("DELETE FROM messages WHERE thread_id = ?").run(conversation.id);
      const insert = this.db.prepare("INSERT INTO messages (id, thread_id, role, text, action, scope, citations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const message of conversation.messages) insert.run(message.id, conversation.id, message.role, message.text, message.action ?? null, message.scope ?? null, JSON.stringify(message.citations), message.createdAt);
    })();
    return conversation;
  }

  deleteConversation(id: string) { return this.db.prepare("DELETE FROM threads WHERE id = ?").run(id).changes > 0; }

  exportNotes(bookId: string, format: "markdown" | "json") {
    const book = this.getBook(bookId);
    if (!book) throw new Error("Book not found.");
    const highlights = this.listHighlights(bookId);
    const slug = book.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLocaleLowerCase() || "book";
    const content = format === "json" ? JSON.stringify({ book: { title: book.title, author: book.author }, highlights }, null, 2) :
      `# ${book.title}\n\n*${book.author}*\n\n${highlights.map((item) => `> ${item.exact}\n\n${item.note ? `**Note:** ${item.note}\n\n` : ""}`).join("---\n\n")}`;
    return { content, suggestedName: `${slug}-notes.${format === "json" ? "json" : "md"}` };
  }

  search(bookId: string, query: string, scope: ReaderScope, currentSpineIndex: number, currentBlockIndex: number): SearchResult[] {
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];
    let predicate = "c.book_id = @bookId";
    if (scope === "current_chapter" || scope === "selection") predicate += " AND c.spine_index = @spine";
    if (scope === "selection") predicate += " AND c.start_block_index <= @block + 2 AND c.end_block_index >= @block - 2";
    if (scope === "read_so_far") predicate += " AND (c.spine_index < @spine OR (c.spine_index = @spine AND c.end_block_index <= @block))";
    const rows = this.db.prepare(`SELECT c.*, ch.title AS chapter_title, ch.href, bm25(chunks_fts, 0, 0, 3, 1) AS rank FROM chunks_fts JOIN book_chunks c ON c.id = chunks_fts.chunk_id JOIN chapters ch ON ch.id = c.chapter_id WHERE chunks_fts MATCH @query AND ${predicate} ORDER BY rank LIMIT 24`)
      .all({ query: ftsQuery, bookId, spine: currentSpineIndex, block: currentBlockIndex }) as Row[];
    const exact = query.normalize("NFKC").toLocaleLowerCase();
    return rows.map((row) => {
      const heading = (JSON.parse(String(row.heading_path)) as string[]).join(" › ");
      let score = -Number(row.rank);
      if (heading.toLocaleLowerCase().includes(exact)) score += 8;
      if (String(row.text).toLocaleLowerCase().includes(exact)) score += 6;
      if (Number(row.spine_index) === currentSpineIndex) score += 2;
      const locator = JSON.parse(String(row.locator_start));
      return {
        score, text: String(row.text).slice(0, 1_600),
        citation: { sourceId: "S0", chunkId: String(row.id), bookId, chapterTitle: String(row.chapter_title), quote: String(row.text).replace(/\s+/g, " ").slice(0, 240), locator, startSpineIndex: Number(row.spine_index), endSpineIndex: Number(row.spine_index), startBlockIndex: Number(row.start_block_index), endBlockIndex: Number(row.end_block_index) }
      };
    }).sort((a, b) => b.score - a.score).slice(0, 8).map((result, index) => ({ ...result, citation: { ...result.citation, sourceId: `S${index + 1}` } }));
  }
}

function mapHighlight(row: Row): Highlight {
  return { id: String(row.id), bookId: String(row.book_id), exact: String(row.exact), prefix: String(row.prefix), suffix: String(row.suffix), color: String(row.color), locator: JSON.parse(String(row.locator)), note: row.note === null ? null : String(row.note), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
