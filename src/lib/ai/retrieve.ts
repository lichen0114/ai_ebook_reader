import type { ReaderScope } from "./types";

export type RetrievalChunk = {
  id: string;
  text: string;
  heading?: string;
  spineIndex: number;
  startBlockIndex: number;
  endBlockIndex: number;
  fullTextRank?: number;
  vectorRank?: number;
};

export function isChunkAllowed(chunk: RetrievalChunk, scope: ReaderScope, currentSpineIndex: number, currentBlockIndex: number) {
  if (scope === "whole_book") return true;
  if (scope === "current_chapter") return chunk.spineIndex === currentSpineIndex;
  if (scope === "selection") {
    return chunk.spineIndex === currentSpineIndex && chunk.startBlockIndex <= currentBlockIndex + 2 && chunk.endBlockIndex >= currentBlockIndex - 2;
  }
  return chunk.spineIndex < currentSpineIndex || (chunk.spineIndex === currentSpineIndex && chunk.endBlockIndex <= currentBlockIndex);
}

export function mergeHybridScores(chunks: RetrievalChunk[]) {
  const reciprocal = (rank?: number) => rank ? 1 / (60 + rank) : 0;
  return chunks.map((chunk) => ({ ...chunk, score: reciprocal(chunk.fullTextRank) + reciprocal(chunk.vectorRank) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

const LATIN_OR_NUMBER = /[\p{L}\p{N}]+/gu;
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

export function normalizeSearchText(text: string) {
  const normalized = text.normalize("NFKC").toLocaleLowerCase();
  const terms = normalized.match(LATIN_OR_NUMBER) ?? [];
  const cjkTerms: string[] = [];
  for (const run of normalized.match(CJK_RUN) ?? []) {
    const characters = [...run];
    if (characters.length === 1) cjkTerms.push(characters[0]);
    for (let index = 0; index < characters.length - 1; index += 1) cjkTerms.push(characters[index] + characters[index + 1]);
  }
  return [...new Set([...terms, ...cjkTerms])].join(" ");
}

export function toFtsQuery(query: string) {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean).slice(0, 24)
    .map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}

export type ScopedHistoryMessage = { role: "user" | "assistant"; scope?: ReaderScope; citations?: Array<{ endSpineIndex: number; endBlockIndex: number }> };

export function filterHistoryForScope(messages: ScopedHistoryMessage[], scope: ReaderScope, spineIndex: number, blockIndex: number) {
  if (scope === "whole_book") return messages;
  return messages.filter((message) => {
    if (message.scope === "whole_book") return false;
    return (message.citations ?? []).every((citation) => citation.endSpineIndex < spineIndex || (citation.endSpineIndex === spineIndex && citation.endBlockIndex <= blockIndex));
  });
}
