import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalRepository } from "@/lib/db/local-repository";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("SQLite repository", () => {
  it("imports Alice, indexes it, deduplicates it, and cascades deletion", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "margin-reader-")); directories.push(directory);
    const repository = new LocalRepository(directory);
    const fixture = path.join(process.cwd(), "public/books/alice.epub");
    const first = await repository.importFile(fixture);
    const duplicate = await repository.importFile(fixture);
    expect(first.status).toBe("ready");
    expect(first.chapters.length).toBeGreaterThan(2);
    expect(duplicate.id).toBe(first.id);
    expect(repository.db.prepare("SELECT count(*) AS count FROM chunks_fts WHERE book_id = ?").get(first.id)).toMatchObject({ count: expect.any(Number) });
    const progress = repository.saveProgress({ bookId: first.id, locator: { type: "epub", href: first.chapters[0].href, spineIndex: 0, blockIndex: 1 }, spineIndex: 0, blockIndex: 1, percentage: 0.2 });
    expect(repository.getProgress(first.id)).toEqual(progress);
    expect(repository.deleteBook(first.id)).toBe(true);
    expect(repository.getBook(first.id)).toBeNull();
    repository.close();
  });

  it("defaults AI settings by credential state and persists explicit provider choices", () => {
    const withKeyDirectory = mkdtempSync(path.join(tmpdir(), "margin-reader-")); directories.push(withKeyDirectory);
    const withKey = new LocalRepository(withKeyDirectory);
    expect(withKey.getAiSettings(true, "qwen3.5:4b")).toEqual({ provider: "gemini", ollamaModel: "qwen3.5:4b" });
    expect(withKey.saveAiSettings({ provider: "ollama", ollamaModel: "qwen3.5:2b" })).toEqual({ provider: "ollama", ollamaModel: "qwen3.5:2b" });
    expect(withKey.getAiSettings(true)).toEqual({ provider: "ollama", ollamaModel: "qwen3.5:2b" });
    withKey.close();

    const newUserDirectory = mkdtempSync(path.join(tmpdir(), "margin-reader-")); directories.push(newUserDirectory);
    const newUser = new LocalRepository(newUserDirectory);
    expect(newUser.getAiSettings(false)).toEqual({ provider: "ollama", ollamaModel: null });
    newUser.close();
  });
});
