import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShell } from "@/components/reader/reader-shell";
import { getSessionId } from "@/lib/auth/session";
import { demoBook } from "@/lib/books/demo";
import { serverRepository } from "@/lib/books/server-repository";

type ReaderPageProps = { params: Promise<{ bookId: string }> };

async function resolveReaderBook(bookId: string) {
  if (bookId === demoBook.id) {
    return {
      id: demoBook.id,
      title: demoBook.title,
      author: demoBook.author,
      originalUrl: demoBook.originalUrl,
      chapters: demoBook.chapters
    };
  }

  const ownerId = await getSessionId();
  const book = serverRepository.books.get(bookId);
  if (!book || book.ownerId !== ownerId || book.status !== "ready") notFound();

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    originalUrl: book.originalUrl,
    chapters: book.chapters
  };
}

export async function generateMetadata({ params }: ReaderPageProps): Promise<Metadata> {
  const { bookId } = await params;
  const book = await resolveReaderBook(bookId);
  return { title: book.title };
}

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { bookId } = await params;
  const book = await resolveReaderBook(bookId);
  return <ReaderShell book={book} />;
}
