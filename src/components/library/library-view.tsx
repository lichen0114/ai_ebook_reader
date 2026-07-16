"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BookOpen, Check, CloudUpload, FileWarning, LoaderCircle, MoreHorizontal, Plus, Search, Sparkles } from "lucide-react";
import type { demoBook as DemoBook } from "@/lib/books/demo";

type LibraryBook = Omit<typeof DemoBook, "status"> & { status: "uploaded" | "parsing" | "chunking" | "embedding" | "ready" | "failed"; local?: boolean };

export function LibraryView({ demoBook }: { demoBook: LibraryBook }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<LibraryBook[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setNotice("");
    const temporary: LibraryBook = { ...demoBook, id: `upload-${file.name}-${file.size}`, title: file.name.replace(/\.epub$/i, ""), author: "Reading metadata…", status: "uploaded", processingProgress: 8, progress: 0, lastRead: "Just uploaded", originalUrl: "", chapters: [], local: true };
    setUploads((items) => [temporary, ...items]);
    const form = new FormData(); form.set("file", file);
    try {
      const response = await fetch("/api/books", { method: "POST", body: form });
      const body = await response.json() as { book?: LibraryBook; error?: string };
      if (!response.ok || !body.book) throw new Error(body.error ?? "Upload failed");
      setUploads((items) => items.map((item) => item.id === temporary.id ? body.book! : item));
      void processBook(body.book.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploads((items) => items.map((item) => item.id === temporary.id ? { ...item, status: "failed", processingProgress: 0 } : item));
      setNotice(message);
    }
  }

  async function processBook(id: string) {
    for (let step = 0; step < 4; step++) {
      const response = await fetch(`/api/books/${id}/process`, { method: "POST" });
      if (!response.ok) break;
      const body = await response.json() as { book: LibraryBook };
      setUploads((items) => items.map((item) => item.id === id ? body.book : item));
      if (body.book.status === "ready" || body.book.status === "failed") break;
    }
  }

  return <main className="min-h-screen px-5 pb-20 sm:px-10 lg:px-16">
    <header className="mx-auto flex h-20 max-w-[1380px] items-center justify-between border-b border-[#d8d0c2]/80">
      <Link href="/library" className="flex items-center gap-3" aria-label="Margin Reader library">
        <span className="grid size-9 place-items-center rounded-full bg-[#28313d] text-[#f7f1e6]"><BookOpen size={17} /></span>
        <span className="text-[15px] font-semibold tracking-[.02em]">Margin Reader</span>
      </Link>
      <div className="flex items-center gap-1">
        <button className="hidden h-10 items-center gap-2 rounded-full px-4 text-sm text-[#6d675e] hover:bg-white/50 sm:flex"><Search size={16} /> Search</button>
        <button onClick={() => inputRef.current?.click()} className="flex h-10 items-center gap-2 rounded-full bg-[#2c3541] px-5 text-sm font-medium text-white shadow-sm transition hover:bg-[#202832]"><Plus size={16} /> Add book</button>
        <input ref={inputRef} className="sr-only" type="file" accept=".epub,application/epub+zip" onChange={(event) => void upload(event.target.files?.[0])} />
      </div>
    </header>

    <div className="mx-auto max-w-[1380px] pt-12">
      <div className="mb-10 flex flex-col justify-between gap-7 md:flex-row md:items-end">
        <div className="max-w-xl animate-rise">
          <p className="small-caps mb-3 text-xs font-semibold text-[#7b7267]">Your reading room</p>
          <h1 className="reader-serif text-4xl leading-tight tracking-[-.025em] sm:text-5xl">Pick up where the page<br className="hidden sm:block" /> left you.</h1>
        </div>
        <div
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }}
          className={`flex min-h-20 items-center gap-4 rounded-2xl border border-dashed px-5 py-4 transition ${dragging ? "border-[#536b88] bg-white/70" : "border-[#c9c0b2] bg-[#faf7f0]/50"}`}
        >
          <CloudUpload className="text-[#6f7d8c]" size={22} />
          <div><p className="text-sm font-medium">Drop a DRM-free EPUB</p><p className="mt-0.5 text-xs text-[#7a746b]">Up to 50 MB · private to this session</p></div>
        </div>
      </div>
      {notice && <div role="alert" className="mb-6 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"><FileWarning size={16} />{notice}</div>}

      <section aria-labelledby="continue-title">
        <div className="mb-5 flex items-center justify-between"><h2 id="continue-title" className="text-xs font-semibold uppercase tracking-[.16em] text-[#777066]">Continue reading</h2><span className="text-xs text-[#8a8379]">1 book in progress</span></div>
        <Link href={`/reader/${demoBook.id}`} className="group grid overflow-hidden rounded-[26px] border border-[#d4ccbf] bg-[#fbf8f1]/80 transition hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(57,46,32,.12)] md:grid-cols-[290px_1fr]">
          <div className="relative min-h-[320px] overflow-hidden bg-[#28323e] p-9 text-[#f0e7d8]">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(90deg,transparent,transparent 32px,rgba(255,255,255,.08) 33px)" }} />
            <div className="relative flex h-full flex-col justify-between border border-[#91a0ad]/40 p-7">
              <span className="small-caps text-[10px] text-[#c7d0d7]">A public-domain edition</span>
              <div><p className="reader-serif text-4xl leading-[.95]">Alice’s<br />Adventures<br /><em className="font-normal text-[#d7bc82]">in Wonderland</em></p><p className="mt-6 text-xs tracking-[.16em] text-[#c5ccd1]">LEWIS CARROLL</p></div>
              <span className="text-[10px] text-[#9eabb4]">MARGIN READER · 1865</span>
            </div>
          </div>
          <div className="flex min-h-[300px] flex-col justify-between p-8 sm:p-10 lg:p-14">
            <div><div className="mb-5 flex items-center gap-2 text-xs text-[#657488]"><span className="size-1.5 rounded-full bg-[#657488]" /> Ready to read <span className="text-[#b0a89d]">·</span> <Sparkles size={13} /> AI ready</div><h3 className="reader-serif text-3xl tracking-[-.02em] sm:text-4xl">{demoBook.title}</h3><p className="mt-2 text-sm text-[#777168]">{demoBook.author}</p><p className="mt-7 max-w-xl reader-serif text-lg leading-relaxed text-[#5c574f]">{demoBook.description}</p></div>
            <div className="mt-10"><div className="mb-2 flex justify-between text-xs text-[#756f66]"><span>Chapter I · Down the Rabbit-Hole</span><span>{demoBook.progress}%</span></div><div className="h-1 overflow-hidden rounded-full bg-[#ded7cb]"><div className="h-full rounded-full bg-[#556b83]" style={{ width: `${demoBook.progress}%` }} /></div><p className="mt-3 text-xs text-[#948d82]">{demoBook.lastRead}</p></div>
          </div>
        </Link>
      </section>

      <section className="mt-14" aria-labelledby="uploads-title">
        <div className="mb-5 flex items-center justify-between"><h2 id="uploads-title" className="text-xs font-semibold uppercase tracking-[.16em] text-[#777066]">Uploaded books</h2><span className="text-xs text-[#8a8379]">{uploads.length || "No uploads yet"}</span></div>
        {!uploads.length ? <button onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border border-dashed border-[#cec5b8] bg-white/25 px-6 py-12 text-center hover:bg-white/45"><CloudUpload size={25} className="mb-3 text-[#6d7a89]" /><span className="text-sm font-medium">Add your first EPUB</span><span className="mt-1 text-xs text-[#817a70]">Books stay within your private reading session.</span></button> :
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{uploads.map((book) => <UploadCard key={book.id} book={book} />)}</div>}
      </section>
    </div>
  </main>;
}

function UploadCard({ book }: { book: LibraryBook }) {
  const state = book.status === "ready" ? { icon: <Check size={13} />, label: "Ready to read" } : book.status === "failed" ? { icon: <FileWarning size={13} />, label: "Processing failed" } : { icon: <LoaderCircle className="animate-spin" size={13} />, label: book.status === "embedding" ? "AI indexing" : book.status === "chunking" ? "Structuring chapters" : "Reading metadata" };
  const inner = <div className="flex min-h-44 gap-5 rounded-2xl border border-[#d9d1c5] bg-[#fbf8f1]/75 p-5"><div className="w-24 shrink-0 rounded-md bg-[#8b5c4e] p-3 shadow-md"><div className="flex h-full items-center border border-white/25 p-2 reader-serif text-sm leading-tight text-white">{book.title}</div></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between"><div><h3 className="truncate reader-serif text-xl">{book.title}</h3><p className="mt-1 text-xs text-[#777168]">{book.author}</p></div><MoreHorizontal size={16} className="text-[#8b857c]" /></div><div className="mt-7 flex items-center gap-1.5 text-xs text-[#657488]">{state.icon}{state.label}</div><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#e0d9ce]"><div className="h-full bg-[#65798e] transition-all" style={{ width: `${book.processingProgress}%` }} /></div></div></div>;
  return book.status === "ready" ? <Link href={`/reader/${book.id}`}>{inner}</Link> : inner;
}
