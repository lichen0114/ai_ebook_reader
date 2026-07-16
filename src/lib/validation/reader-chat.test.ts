import { describe, expect, it } from "vitest";
import { readerChatRequestSchema } from "./reader-chat";

const valid = { messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "Explain" }] }], bookId: "alice-in-wonderland", action: "explain", scope: "selection", currentLocator: { type: "epub", href: "chapter.xhtml", spineIndex: 0, blockIndex: 2 }, currentSpineIndex: 0, currentBlockIndex: 2, selectedText: "a curious phrase" };
describe("reader chat request validation", () => {
  it("accepts complete dynamic reader context", () => expect(readerChatRequestSchema.safeParse(valid).success).toBe(true));
  it("requires selected text for selection scope", () => expect(readerChatRequestSchema.safeParse({ ...valid, selectedText: undefined }).success).toBe(false));
  it("rejects unknown actions and inconsistent positions", () => { expect(readerChatRequestSchema.safeParse({ ...valid, action: "summarize-web" }).success).toBe(false); expect(readerChatRequestSchema.safeParse({ ...valid, currentSpineIndex: -1 }).success).toBe(false); });
});
