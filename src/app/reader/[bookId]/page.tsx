import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShell } from "@/components/reader/reader-shell";
import { demoBook } from "@/lib/books/demo";

export const metadata: Metadata = { title: demoBook.title };
export default async function ReaderPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  if (bookId !== demoBook.id && !bookId.startsWith("upload-")) notFound();
  return <ReaderShell book={{ ...demoBook, id: bookId, originalUrl: bookId === demoBook.id ? demoBook.originalUrl : `/uploads/${bookId}.epub` }} />;
}
