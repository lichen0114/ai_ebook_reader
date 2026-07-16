import type { UIMessage } from "ai";
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

export type ReaderDataParts = {
  retrieval: { status: "searching" | "reranking" | "ready" | "failed"; candidateCount?: number };
  sources: { items: Citation[] };
  scope: { value: ReaderScope; spoilerRisk: boolean };
  warning: { code: string; message: string };
};

export type ReaderMessageMetadata = { action?: ReaderAction; scope?: ReaderScope; createdAt?: string };
export type ReaderUIMessage = UIMessage<ReaderMessageMetadata, ReaderDataParts>;
