import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getConfig } from "@/lib/config";
import { getSessionId } from "@/lib/auth/session";
import { getObjectStore } from "@/lib/storage";
import { serverRepository } from "@/lib/books/server-repository";
import { demoBook } from "@/lib/books/demo";

export async function GET() {
  const ownerId = await getSessionId();
  return NextResponse.json({ books: [demoBook, ...[...serverRepository.books.values()].filter((book) => book.ownerId === ownerId)] });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an EPUB file to upload." }, { status: 400 });
    const config = getConfig();
    if (file.size > config.MAX_UPLOAD_BYTES) return NextResponse.json({ error: `This file is larger than ${Math.floor(config.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
    if (!/\.epub$/i.test(file.name) || !["application/epub+zip", "application/octet-stream", ""].includes(file.type)) return NextResponse.json({ error: "Margin Reader currently supports DRM-free EPUB files only." }, { status: 415 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return NextResponse.json({ error: "This does not appear to be a valid EPUB archive." }, { status: 400 });
    const id = randomUUID();
    const storageKey = `${id}.epub`;
    await getObjectStore().put(storageKey, bytes, "application/epub+zip");
    const ownerId = await getSessionId();
    const book = { id, ownerId, title: file.name.replace(/\.epub$/i, ""), author: "Reading metadata…", language: "en", status: "uploaded" as const, processingProgress: 8, originalUrl: await getObjectStore().getUrl(storageKey), storageKey, progress: 0, lastRead: "Just uploaded", description: "Your private DRM-free EPUB.", chapters: [] };
    serverRepository.books.set(id, book);
    return NextResponse.json({ book }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "The upload could not be stored. Your existing books are unaffected." }, { status: 500 });
  }
}
