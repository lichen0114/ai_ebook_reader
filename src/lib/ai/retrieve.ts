import type { ReaderScope } from "./types";

export type RetrievalChunk = {
  id: string;
  text: string;
  spineIndex: number;
  startBlockIndex: number;
  endBlockIndex: number;
  fullTextRank?: number;
  vectorRank?: number;
};

export function isChunkAllowed(chunk: RetrievalChunk, scope: ReaderScope, currentSpineIndex: number, currentBlockIndex: number) {
  if (scope === "whole_book") return true;
  if (scope === "current_chapter") return chunk.spineIndex === currentSpineIndex;
  if (scope === "selection") return chunk.spineIndex === currentSpineIndex && chunk.startBlockIndex <= currentBlockIndex + 2 && chunk.endBlockIndex >= currentBlockIndex - 2;
  return chunk.spineIndex < currentSpineIndex || (chunk.spineIndex === currentSpineIndex && chunk.endBlockIndex <= currentBlockIndex);
}

export function mergeHybridScores(chunks: RetrievalChunk[]) {
  const reciprocal = (rank?: number) => rank ? 1 / (60 + rank) : 0;
  return chunks.map((chunk) => ({ ...chunk, score: reciprocal(chunk.fullTextRank) + reciprocal(chunk.vectorRank) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export type ScopedHistoryMessage = { role: "user" | "assistant"; scope?: ReaderScope; citations?: Array<{ endSpineIndex: number; endBlockIndex: number }> };

export function filterHistoryForScope(messages: ScopedHistoryMessage[], scope: ReaderScope, spineIndex: number, blockIndex: number) {
  if (scope === "whole_book") return messages;
  return messages.filter((message) => {
    if (message.scope === "whole_book") return false;
    return (message.citations ?? []).every((citation) => citation.endSpineIndex < spineIndex || (citation.endSpineIndex === spineIndex && citation.endBlockIndex <= blockIndex));
  });
}
