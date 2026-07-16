import type { ParsedEpub } from "./epub-parser";
import type { PublicationLocator } from "@/lib/reader/publication-adapter";

export type ServerBook = {
  id: string; ownerId: string; title: string; author: string; language: string; status: "uploaded" | "parsing" | "chunking" | "embedding" | "ready" | "failed";
  processingProgress: number; processingError?: string; originalUrl: string; storageKey: string; progress: number; lastRead: string; description: string;
  chapters: Array<{ id: string; label: string; href: string; spineIndex: number }>; parsed?: ParsedEpub;
};
export type ProgressRecord = { locator: PublicationLocator; spineIndex: number; blockIndex: number; percentage: number; updatedAt: string };
export type HighlightRecord = { id: string; ownerId: string; bookId: string; exact: string; prefix: string; suffix: string; color: string; locator: PublicationLocator; note?: string; createdAt: string; updatedAt: string };

type DemoState = { books: Map<string, ServerBook>; progress: Map<string, ProgressRecord>; highlights: Map<string, HighlightRecord>; rateLimits: Map<string, number[]> };
declare global { var marginReaderState: DemoState | undefined; }
export const serverRepository: DemoState = globalThis.marginReaderState ??= { books: new Map(), progress: new Map(), highlights: new Map(), rateLimits: new Map() };
export function ownsBook(ownerId: string, bookId: string) { return bookId === "alice-in-wonderland" || serverRepository.books.get(bookId)?.ownerId === ownerId; }
