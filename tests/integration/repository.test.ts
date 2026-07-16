import { beforeEach, describe, expect, it } from "vitest";
import { ownsBook, serverRepository } from "@/lib/books/server-repository";

describe("local integration repository", () => {
  beforeEach(() => { serverRepository.books.clear(); serverRepository.progress.clear(); serverRepository.highlights.clear(); });
  it("enforces book ownership", () => { serverRepository.books.set("private", { id: "private", ownerId: "owner-a", title: "Book", author: "Author", language: "en", status: "ready", processingProgress: 100, originalUrl: "/book.epub", storageKey: "book.epub", progress: 0, lastRead: "now", description: "", chapters: [] }); expect(ownsBook("owner-a", "private")).toBe(true); expect(ownsBook("owner-b", "private")).toBe(false); });
  it("persists and restores progress by owner and book", () => { const key = "owner:book"; const value = { locator: { type: "epub" as const, href: "ch.xhtml", spineIndex: 1, cfi: "epubcfi(/6/4)" }, spineIndex: 1, blockIndex: 4, percentage: .32, updatedAt: new Date(0).toISOString() }; serverRepository.progress.set(key, value); expect(serverRepository.progress.get(key)).toEqual(value); });
  it("creates, restores, and deletes a durable highlight record", () => { const record = { id: "h1", ownerId: "owner", bookId: "book", exact: "selected", prefix: "a ", suffix: " phrase", color: "ochre", locator: { type: "epub" as const, href: "ch.xhtml", spineIndex: 0, cfi: "epubcfi(/6/2)" }, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }; serverRepository.highlights.set(record.id, record); expect([...serverRepository.highlights.values()]).toContainEqual(record); serverRepository.highlights.delete(record.id); expect(serverRepository.highlights.size).toBe(0); });
});
