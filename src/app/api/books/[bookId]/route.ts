import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/auth/session";
import { getObjectStore } from "@/lib/storage";
import { demoBook } from "@/lib/books/demo";
import { ownsBook, serverRepository } from "@/lib/books/server-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params; const ownerId = await getSessionId();
  if (!ownsBook(ownerId, bookId)) return NextResponse.json({ error: "Book not found." }, { status: 404 });
  return NextResponse.json({ book: bookId === demoBook.id ? demoBook : serverRepository.books.get(bookId) });
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params; const ownerId = await getSessionId(); const book = serverRepository.books.get(bookId);
  if (!book || book.ownerId !== ownerId) return NextResponse.json({ error: "Book not found." }, { status: 404 });
  await getObjectStore().delete(book.storageKey); serverRepository.books.delete(bookId);
  for (const [id, highlight] of serverRepository.highlights) if (highlight.bookId === bookId && highlight.ownerId === ownerId) serverRepository.highlights.delete(id);
  serverRepository.progress.delete(`${ownerId}:${bookId}`);
  return new NextResponse(null, { status: 204 });
}
