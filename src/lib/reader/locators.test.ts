import { describe, expect, it } from "vitest";
import { createQuoteAnchor, findQuoteAnchor, parseLocator, serializeLocator } from "./locators";
import type { PublicationLocator } from "./publication-adapter";

describe("publication locators", () => {
  it("round-trips EPUB locators without losing quote anchors", () => { const locator: PublicationLocator = { type: "epub", href: "chapter.xhtml", spineIndex: 2, blockIndex: 8, cfi: "epubcfi(/6/8)", quote: { exact: "Rabbit", prefix: "White ", suffix: " ran" } }; expect(parseLocator(serializeLocator(locator))).toEqual(locator); });
  it("rejects malformed locators", () => { expect(parseLocator("nope")).toBeNull(); expect(parseLocator('{"type":"epub"}')).toBeNull(); });
  it("creates and resolves a contextual quote anchor", () => { const text = "The rabbit ran. Another rabbit waited."; const start = text.lastIndexOf("rabbit"); const anchor = createQuoteAnchor(text, start, start + 6); expect(findQuoteAnchor(text, anchor)).toEqual({ start, end: start + 6 }); });
  it("uses prefix/suffix to disambiguate repeated text", () => { const text = "red book and blue book"; expect(findQuoteAnchor(text, { exact: "book", prefix: "blue ", suffix: "" })?.start).toBe(18); });
});
