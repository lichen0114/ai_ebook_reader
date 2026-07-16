import { describe, expect, it } from "vitest";
import { normalizeSearchText, toFtsQuery } from "./retrieve";

describe("offline query normalization", () => {
  it("normalizes Latin text and diacritics", () => { expect(normalizeSearchText("Rabbit RABBIT Café")).toContain("rabbit"); });
  it("adds overlapping Chinese bigrams", () => { const normalized = normalizeSearchText("愛麗絲夢遊仙境"); expect(normalized).toContain("愛麗"); expect(normalized).toContain("麗絲"); });
  it("builds a bounded safe FTS query", () => { expect(toFtsQuery('rabbit "watch"')).toBe('"rabbit" OR "watch"'); });
});
