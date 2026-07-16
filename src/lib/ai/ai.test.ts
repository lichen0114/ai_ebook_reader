import { describe, expect, it } from "vitest";
import { validateCitationMarkers } from "./citations";
import { filterHistoryForScope, isChunkAllowed, mergeHybridScores, type RetrievalChunk } from "./retrieve";
import type { Citation } from "./types";

const chunks: RetrievalChunk[] = [
  { id: "early", text: "early", spineIndex: 0, startBlockIndex: 0, endBlockIndex: 2 },
  { id: "current-before", text: "current", spineIndex: 1, startBlockIndex: 0, endBlockIndex: 4 },
  { id: "current-after", text: "later", spineIndex: 1, startBlockIndex: 5, endBlockIndex: 8 },
  { id: "later", text: "spoiler", spineIndex: 2, startBlockIndex: 0, endBlockIndex: 2 }
];

describe("scope enforcement", () => {
  it("enforces read-so-far before ranking", () => expect(chunks.filter((chunk) => isChunkAllowed(chunk, "read_so_far", 1, 4)).map((chunk) => chunk.id)).toEqual(["early", "current-before"]));
  it("allows the whole book only under whole-book scope", () => expect(chunks.filter((chunk) => isChunkAllowed(chunk, "whole_book", 1, 4))).toHaveLength(4));
  it("restricts current chapter and selection adjacency", () => { expect(chunks.filter((chunk) => isChunkAllowed(chunk, "current_chapter", 1, 4)).map((chunk) => chunk.id)).toEqual(["current-before", "current-after"]); expect(isChunkAllowed(chunks[3], "selection", 1, 4)).toBe(false); });
  it("removes whole-book and later-citing assistant history from read-so-far", () => { const history = [{ role: "assistant" as const, scope: "whole_book" as const }, { role: "assistant" as const, scope: "read_so_far" as const, citations: [{ endSpineIndex: 2, endBlockIndex: 0 }] }, { role: "user" as const, scope: "read_so_far" as const }]; expect(filterHistoryForScope(history, "read_so_far", 1, 4)).toEqual([history[2]]); });
});

describe("hybrid retrieval and citations", () => {
  it("merges reciprocal ranks deterministically", () => { const ranked = mergeHybridScores([{ ...chunks[0], fullTextRank: 1, vectorRank: 3 }, { ...chunks[1], fullTextRank: 2, vectorRank: 1 }]); expect(ranked[0].id).toBe("current-before"); expect(ranked[0].score).toBeGreaterThan(0); });
  it("removes invalid source markers and reports them", () => { const citation = { sourceId: "S1" } as Citation; expect(validateCitationMarkers("Claim [S1]. Bad [S9].", [citation])).toEqual({ text: "Claim [S1]. Bad .", invalid: ["S9"] }); });
});
