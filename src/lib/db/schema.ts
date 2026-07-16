import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { LocalCitation } from "@/shared/ipc";
import type { PublicationLocator } from "@/lib/reader/publication-adapter";

export const books = sqliteTable("books", {
  id: text("id").primaryKey(), sha256: text("sha256").notNull(), title: text("title").notNull(), author: text("author").notNull(), language: text("language").notNull().default("en"),
  description: text("description").notNull().default(""), originalRelativePath: text("original_relative_path").notNull(),
  status: text("status", { enum: ["uploaded", "parsing", "chunking", "indexing", "ready", "failed"] }).notNull(), processingProgress: integer("processing_progress").notNull().default(0),
  processingError: text("processing_error"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull()
}, (table) => [uniqueIndex("books_sha256_uidx").on(table.sha256)]);

export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), spineIndex: integer("spine_index").notNull(),
  href: text("href").notNull(), title: text("title").notNull(), startBlockIndex: integer("start_block_index").notNull(), endBlockIndex: integer("end_block_index").notNull()
}, (table) => [uniqueIndex("chapters_book_spine_uidx").on(table.bookId, table.spineIndex)]);

export const bookBlocks = sqliteTable("book_blocks", {
  id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), chapterId: text("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  spineIndex: integer("spine_index").notNull(), blockIndex: integer("block_index").notNull(), blockType: text("block_type").notNull(), headingPath: text("heading_path", { mode: "json" }).$type<string[]>().notNull(),
  text: text("text").notNull(), locator: text("locator", { mode: "json" }).$type<PublicationLocator>().notNull()
}, (table) => [uniqueIndex("blocks_book_spine_block_uidx").on(table.bookId, table.spineIndex, table.blockIndex)]);

export const bookChunks = sqliteTable("book_chunks", {
  id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), chapterId: text("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(), spineIndex: integer("spine_index").notNull(), startBlockIndex: integer("start_block_index").notNull(), endBlockIndex: integer("end_block_index").notNull(),
  headingPath: text("heading_path", { mode: "json" }).$type<string[]>().notNull(), text: text("text").notNull(), normalizedText: text("normalized_text").notNull(), locatorStart: text("locator_start", { mode: "json" }).$type<PublicationLocator>().notNull(), locatorEnd: text("locator_end", { mode: "json" }).$type<PublicationLocator>().notNull(), tokenCount: integer("token_count").notNull()
}, (table) => [uniqueIndex("chunks_book_ordinal_uidx").on(table.bookId, table.ordinal), index("chunks_scope_idx").on(table.bookId, table.spineIndex, table.endBlockIndex)]);

export const readingProgress = sqliteTable("reading_progress", { bookId: text("book_id").primaryKey().references(() => books.id, { onDelete: "cascade" }), locator: text("locator", { mode: "json" }).$type<PublicationLocator>().notNull(), spineIndex: integer("spine_index").notNull(), blockIndex: integer("block_index").notNull(), percentage: real("percentage").notNull(), settings: text("settings", { mode: "json" }), updatedAt: text("updated_at").notNull() });
export const highlights = sqliteTable("highlights", { id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), exact: text("exact").notNull(), prefix: text("prefix").notNull(), suffix: text("suffix").notNull(), color: text("color").notNull(), locator: text("locator", { mode: "json" }).$type<PublicationLocator>().notNull(), note: text("note"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() }, (table) => [index("highlights_book_idx").on(table.bookId)]);
export const threads = sqliteTable("threads", { id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), title: text("title").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull() });
export const messages = sqliteTable("messages", { id: text("id").primaryKey(), threadId: text("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }), role: text("role", { enum: ["user", "assistant"] }).notNull(), text: text("text").notNull(), action: text("action"), scope: text("scope"), citations: text("citations", { mode: "json" }).$type<LocalCitation[]>().notNull(), createdAt: text("created_at").notNull() });
export const aiUsage = sqliteTable("ai_usage", { id: text("id").primaryKey(), bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), model: text("model").notNull(), action: text("action").notNull(), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), latencyMs: integer("latency_ms").notNull(), createdAt: text("created_at").notNull() });
export const settings = sqliteTable("settings", { key: text("key").primaryKey(), value: text("value", { mode: "json" }).notNull(), updatedAt: text("updated_at").notNull() });
