import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth/session";
import { getObjectStore } from "@/lib/storage";
import { parseEpub } from "@/lib/books/epub-parser";
import { serverRepository } from "@/lib/books/server-repository";

export async function POST(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params; const ownerId = await getSessionId(); const book = serverRepository.books.get(bookId);
  if (!book || book.ownerId !== ownerId) return NextResponse.json({ error: "Book not found." }, { status: 404 });
  try {
    if (book.status === "uploaded") {
      book.status = "parsing"; book.processingProgress = 22;
      const bytes = await getObjectStore().get(book.storageKey); book.parsed = await parseEpub(bytes.buffer as ArrayBuffer);
      book.title = book.parsed.title; book.author = book.parsed.author; book.language = book.parsed.language; book.chapters = book.parsed.chapters.map((chapter) => ({ id: `${book.id}-${chapter.spineIndex}`, label: chapter.title, href: chapter.href.replace(/^EPUB\//, ""), spineIndex: chapter.spineIndex }));
      return NextResponse.json({ book });
    }
    if (book.status === "parsing") { book.status = "chunking"; book.processingProgress = 58; return NextResponse.json({ book }); }
    if (book.status === "chunking") { book.status = "embedding"; book.processingProgress = 82; return NextResponse.json({ book }); }
    if (book.status === "embedding") { book.status = "ready"; book.processingProgress = 100; return NextResponse.json({ book }); }
    return NextResponse.json({ book });
  } catch (error) {
    book.status = "failed"; book.processingProgress = 0; book.processingError = error instanceof Error ? error.message : "Processing failed";
    return NextResponse.json({ book, error: "This EPUB could not be processed. It may be invalid, encrypted, or unsafe." }, { status: 422 });
  }
}
