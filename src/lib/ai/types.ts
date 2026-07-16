import type { PublicationLocator } from "@/lib/reader/publication-adapter";

export type ReaderAction = "ask" | "explain" | "define" | "translate" | "example" | "recap" | "checkpoint-evaluate";
export type ReaderScope = "selection" | "current_chapter" | "read_so_far" | "whole_book";

export type Citation = {
  sourceId: string;
  chunkId: string;
  bookId: string;
  chapterTitle: string;
  quote: string;
  locator: PublicationLocator;
  startSpineIndex: number;
  endSpineIndex: number;
  startBlockIndex: number;
  endBlockIndex: number;
};
