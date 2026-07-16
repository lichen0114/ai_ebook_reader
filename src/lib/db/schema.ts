import { customType, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";
import type { Citation, ReaderAction, ReaderScope } from "@/lib/ai/types";
import type { PublicationLocator } from "@/lib/reader/publication-adapter";
import { EMBEDDING_DIMENSION } from "@/lib/config";

const tsvector = customType<{ data: string }>({ dataType() { return "tsvector"; } });
export const bookStatus = pgEnum("book_status", ["uploaded", "parsing", "chunking", "embedding", "ready", "failed"]);
export const bookFormat = pgEnum("book_format", ["epub", "pdf"]);
export const messageRole = pgEnum("message_role", ["user", "assistant", "system"]);

export const sessions = pgTable("sessions", { id: uuid("id").primaryKey().defaultRandom(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });

export const books = pgTable("books", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  title: text("title").notNull(), author: text("author").notNull(), language: text("language").notNull().default("en"), description: text("description"),
  format: bookFormat("format").notNull().default("epub"), coverStorageKey: text("cover_storage_key"), originalStorageKey: text("original_storage_key").notNull(),
  status: bookStatus("status").notNull().default("uploaded"), processingProgress: integer("processing_progress").notNull().default(0), processingError: text("processing_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("books_owner_idx").on(table.ownerId)]);

export const chapters = pgTable("chapters", {
  id: uuid("id").primaryKey().defaultRandom(), bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), spineIndex: integer("spine_index").notNull(),
  href: text("href").notNull(), title: text("title").notNull(), startBlockIndex: integer("start_block_index").notNull(), endBlockIndex: integer("end_block_index").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("chapters_book_spine_uidx").on(table.bookId, table.spineIndex)]);

export const bookBlocks = pgTable("book_blocks", {
  id: uuid("id").primaryKey().defaultRandom(), bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), chapterId: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  spineIndex: integer("spine_index").notNull(), blockIndex: integer("block_index").notNull(), blockType: text("block_type").notNull(), headingPath: jsonb("heading_path").$type<string[]>().notNull().default([]),
  text: text("text").notNull(), locator: jsonb("locator").$type<PublicationLocator>().notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("blocks_book_spine_block_uidx").on(table.bookId, table.spineIndex, table.blockIndex)]);

export const bookChunks = pgTable("book_chunks", {
  id: uuid("id").primaryKey().defaultRandom(), bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), chapterId: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(), spineIndex: integer("spine_index").notNull(), startBlockIndex: integer("start_block_index").notNull(), endBlockIndex: integer("end_block_index").notNull(),
  headingPath: jsonb("heading_path").$type<string[]>().notNull().default([]), text: text("text").notNull(), locatorStart: jsonb("locator_start").$type<PublicationLocator>().notNull(), locatorEnd: jsonb("locator_end").$type<PublicationLocator>().notNull(),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSION }), searchText: tsvector("search_text"), tokenCount: integer("token_count").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("chunks_book_ordinal_uidx").on(table.bookId, table.ordinal), index("chunks_scope_idx").on(table.bookId, table.spineIndex, table.endBlockIndex), index("chunks_search_idx").using("gin", table.searchText), index("chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops"))]);

export const readingProgress = pgTable("reading_progress", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull().references(() => sessions.id, { onDelete: "cascade" }), bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  locator: jsonb("locator").$type<PublicationLocator>().notNull(), spineIndex: integer("spine_index").notNull(), blockIndex: integer("block_index").notNull(), percentage: real("percentage").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("progress_owner_book_uidx").on(table.ownerId, table.bookId)]);

export const highlights = pgTable("highlights", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull().references(() => sessions.id, { onDelete: "cascade" }), bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  color: text("color").notNull().default("ochre"), exact: text("exact").notNull(), prefix: text("prefix").notNull().default(""), suffix: text("suffix").notNull().default(""), locator: jsonb("locator").$type<PublicationLocator>().notNull(), note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("highlights_owner_book_idx").on(table.ownerId, table.bookId)]);

export const threads = pgTable("threads", { id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull().references(() => sessions.id, { onDelete: "cascade" }), bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), title: text("title").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() });
export const messages = pgTable("messages", { id: uuid("id").primaryKey().defaultRandom(), threadId: uuid("thread_id").notNull().references(() => threads.id, { onDelete: "cascade" }), role: messageRole("role").notNull(), parts: jsonb("parts").$type<unknown[]>().notNull(), action: text("action").$type<ReaderAction>(), scope: text("scope").$type<ReaderScope>(), currentLocator: jsonb("current_locator").$type<PublicationLocator>(), citations: jsonb("citations").$type<Citation[]>().notNull().default([]), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export const aiUsage = pgTable("ai_usage", { id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull().references(() => sessions.id, { onDelete: "cascade" }), bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }), model: text("model").notNull(), action: text("action").notNull(), inputTokens: integer("input_tokens"), outputTokens: integer("output_tokens"), latencyMs: integer("latency_ms").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
