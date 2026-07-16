import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createChunks } from "./chunk";
import { parseEpub } from "./epub-parser";
import { isSafeArchivePath, sanitizeEpubHtml } from "./sanitize";

describe("EPUB safety and extraction", () => {
  it.each(["../secret", "/etc/passwd", "OPS/../../secret", "C:\\secret", "OPS\\..\\secret"])("rejects unsafe archive path %s", (value) => expect(isSafeArchivePath(value)).toBe(false));
  it.each(["META-INF/container.xml", "EPUB/text/chapter.xhtml", "mimetype"])("accepts safe archive path %s", (value) => expect(isSafeArchivePath(value)).toBe(true));
  it("strips executable and tracking HTML", () => {
    const safe = sanitizeEpubHtml(`<p onclick="steal()">Readable</p><script>alert(1)</script><iframe src="https://tracker.test"></iframe><form><input/></form><a href="https://tracker.test">out</a>`);
    expect(safe).toContain("Readable"); expect(safe).not.toMatch(/script|iframe|form|onclick|https:\/\//);
  });
  it("extracts metadata, ordered chapters, blocks, and chunks from the fixture", async () => {
    const bytes = await readFile(path.join(process.cwd(), "public/books/alice.epub"));
    const parsed = await parseEpub(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(parsed.title).toBe("Alice’s Adventures in Wonderland"); expect(parsed.author).toBe("Lewis Carroll"); expect(parsed.language).toBe("en");
    expect(parsed.chapters).toHaveLength(4); expect(parsed.chapters[0].title).toContain("Rabbit-Hole"); expect(parsed.chapters[0].blocks[1].blockIndex).toBe(1); expect(parsed.chapters[0].chunks.length).toBeGreaterThan(0);
  });
});

describe("structured chunking", () => {
  const blocks = [
    { blockIndex: 0, blockType: "h1", text: "A heading", headingPath: ["A heading"] },
    { blockIndex: 1, blockType: "p", text: "First complete paragraph. ".repeat(20), headingPath: ["A heading"] },
    { blockIndex: 2, blockType: "p", text: "Second complete paragraph. ".repeat(20), headingPath: ["A heading"] },
    { blockIndex: 3, blockType: "nav", text: "Navigation", headingPath: [] }
  ];
  it("keeps paragraph boundaries and heading paths", () => { const chunks = createChunks(blocks, 20, 120); expect(chunks.length).toBeGreaterThan(1); expect(chunks[0].headingPath).toEqual(["A heading"]); expect(chunks.some((chunk) => chunk.text.includes("Navigation"))).toBe(false); });
  it("is deterministic across resumable retries", () => expect(createChunks(blocks, 20, 120)).toEqual(createChunks(blocks, 20, 120)));
});
