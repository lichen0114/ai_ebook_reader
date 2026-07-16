import type { Citation } from "@/lib/ai/types";

export const DEMO_BOOK_ID = "alice-in-wonderland";
export const demoBook = {
  id: DEMO_BOOK_ID,
  title: "Alice’s Adventures in Wonderland",
  author: "Lewis Carroll",
  language: "en",
  status: "ready" as const,
  processingProgress: 100,
  progress: 18,
  lastRead: "A quiet moment ago",
  originalUrl: "/books/alice.epub",
  description: "A curious afternoon tumbles into a world where logic bends and language plays tricks.",
  chapters: [
    { id: "ch-1", label: "I. Down the Rabbit-Hole", href: "text/chapter-1.xhtml", spineIndex: 0 },
    { id: "ch-2", label: "II. The Pool of Tears", href: "text/chapter-2.xhtml", spineIndex: 1 },
    { id: "ch-3", label: "III. A Caucus-Race", href: "text/chapter-3.xhtml", spineIndex: 2 },
    { id: "ch-4", label: "IV. The Rabbit Sends in a Little Bill", href: "text/chapter-4.xhtml", spineIndex: 3 }
  ]
};

export const demoCitations: Citation[] = [
  { sourceId: "S1", chunkId: "alice-0-0", bookId: DEMO_BOOK_ID, chapterTitle: "I. Down the Rabbit-Hole", quote: "what is the use of a book, thought Alice, without pictures or conversations?", locator: { type: "epub", href: "text/chapter-1.xhtml", spineIndex: 0, blockIndex: 1, quote: { exact: "what is the use of a book", prefix: "once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, ‘and ", suffix: "’ thought Alice ‘without pictures or conversations?’" } }, startSpineIndex: 0, endSpineIndex: 0, startBlockIndex: 1, endBlockIndex: 1 },
  { sourceId: "S2", chunkId: "alice-0-2", bookId: DEMO_BOOK_ID, chapterTitle: "I. Down the Rabbit-Hole", quote: "she was considering in her own mind whether the pleasure of making a daisy-chain would be worth the trouble", locator: { type: "epub", href: "text/chapter-1.xhtml", spineIndex: 0, blockIndex: 2 }, startSpineIndex: 0, endSpineIndex: 0, startBlockIndex: 2, endBlockIndex: 2 }
];
