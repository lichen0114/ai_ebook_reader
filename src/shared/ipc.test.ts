import { describe, expect, it } from "vitest";
import { aiStartIpcRequestSchema, requestSchemas } from "./ipc";

const request = {
  bookId: "98e68179-da37-4b66-a122-b0edc779f55e",
  requestId: "b69b40c1-b7cf-48bb-92b6-e9dfc288abdc",
  question: "Explain this passage",
  action: "explain" as const,
  scope: "selection" as const,
  currentLocator: { type: "epub" as const, href: "chapter.xhtml", spineIndex: 0, blockIndex: 2 },
  currentSpineIndex: 0,
  currentBlockIndex: 2,
  selectedText: "A curious phrase"
};

describe("AI IPC request schemas", () => {
  it("validates renderer-to-main requests without deriving them from the refined utility schema", () => {
    expect(() => aiStartIpcRequestSchema.parse(request)).not.toThrow();
    expect(() => requestSchemas["ai.start"].parse({ ...request, provider: "ollama", model: "qwen3.5:4b" })).not.toThrow();
  });

  it("preserves selection validation on both IPC boundaries", () => {
    expect(aiStartIpcRequestSchema.safeParse({ ...request, selectedText: undefined }).success).toBe(false);
    expect(requestSchemas["ai.start"].safeParse({ ...request, selectedText: undefined, provider: "ollama", model: "qwen3.5:4b" }).success).toBe(false);
  });
});
