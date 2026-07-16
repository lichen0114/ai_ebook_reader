import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, CloudUpload, FileWarning, KeyRound, LoaderCircle, MoreHorizontal, Plus, Search, Settings, Trash2 } from "lucide-react";
import type { LocalBook } from "@/shared/ipc";
import { Link } from "@/renderer/router";

export function LibraryView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [books, setBooks] = useState<LocalBook[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const refresh = useCallback(() => void window.marginReader.library.list().then(setBooks).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "The library could not be opened.")), []);

  useEffect(() => {
    refresh();
    void window.marginReader.credentials.status().then((value) => setConfigured(value.configured));
    const removeProgress = window.marginReader.imports.onProgress(() => refresh());
    const handleRefresh = () => refresh();
    const handleSearch = () => setSearchOpen(true);
    window.addEventListener("margin:library-refresh", handleRefresh);
    window.addEventListener("margin:search", handleSearch);
    return () => { removeProgress(); window.removeEventListener("margin:library-refresh", handleRefresh); window.removeEventListener("margin:search", handleSearch); };
  }, [refresh]);

  async function upload(file?: File) {
    setNotice("");
    try { const book = await window.marginReader.library.importFile(file); if (book) refresh(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The EPUB could not be imported."); }
  }
  async function remove(book: LocalBook) {
    if (!confirm(`Remove “${book.title}” and all of its local notes?`)) return;
    await window.marginReader.library.delete(book.id); refresh();
  }
  const filtered = books.filter((book) => `${book.title} ${book.author}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <main className="min-h-dvh bg-[#f4efe5] px-4 pb-16 pt-[52px] text-[#25231f] sm:px-8">
    <header className="mx-auto flex h-16 max-w-[1380px] items-center justify-between border-b border-[#d8d0c2]/80">
      <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#28313d] text-[#f7f1e6]"><BookOpen size={17}/></span><span className="truncate text-[15px] font-semibold tracking-[.02em]">Margin Reader</span><span className="hidden rounded-full border border-[#d5cdc0] px-2 py-1 text-[9px] uppercase tracking-[.12em] text-[#7a7369] sm:inline">On this Mac</span></div>
      <div className="flex shrink-0 items-center gap-1"><button onClick={() => setSearchOpen(true)} className="grid size-10 place-items-center rounded-full hover:bg-white/45" aria-label="Search library"><Search size={16}/></button><button onClick={onOpenSettings} className="grid size-10 place-items-center rounded-full hover:bg-white/45" aria-label="Settings"><Settings size={16}/></button><button onClick={() => void upload()} className="ml-1 flex size-10 items-center justify-center rounded-full bg-[#2c3541] text-sm font-medium text-white shadow-sm transition hover:bg-[#202832] sm:h-10 sm:w-auto sm:gap-2 sm:px-5"><Plus size={16}/><span className="hidden sm:inline">Add book</span></button><input ref={inputRef} className="sr-only" type="file" accept=".epub,application/epub+zip" onChange={(event) => void upload(event.target.files?.[0])}/></div>
    </header>
    <div className="mx-auto max-w-[1380px] pt-11">
      <div className="mb-10 flex flex-col items-stretch justify-between gap-8 lg:flex-row lg:items-end"><div className="animate-rise"><p className="small-caps mb-3 text-xs font-semibold text-[#7b7267]">Your private reading room</p><h1 className="reader-serif text-4xl leading-[1.04] tracking-[-.03em] sm:text-5xl">Pages worth returning to.</h1><p className="mt-4 max-w-xl text-sm leading-relaxed text-[#70695f]">Your books, notes, and search index stay on this Mac. Add a DRM-free EPUB and keep reading offline.</p></div>
        <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }} className={`flex min-h-20 min-w-0 items-center gap-4 rounded-2xl border border-dashed px-5 py-4 transition lg:min-w-[330px] ${dragging ? "border-[#536b88] bg-white/75" : "border-[#c9c0b2] bg-[#faf7f0]/50"}`}><CloudUpload className="shrink-0 text-[#6f7d8c]" size={22}/><div className="min-w-0"><p className="text-sm font-medium">Drop a DRM-free EPUB</p><p className="mt-0.5 text-xs text-[#7a746b]">Up to 50 MB · copied into your library</p></div></div>
      </div>
      {!configured && <button onClick={onOpenSettings} className="mb-7 flex w-full items-center gap-4 rounded-2xl border border-[#c7d2dc] bg-[#e9eef1]/75 px-5 py-4 text-left"><span className="grid size-9 place-items-center rounded-full bg-[#d8e1e8] text-[#4b6176]"><KeyRound size={16}/></span><span><strong className="block text-sm">Reading works offline. Add a Gemini key when you want the intelligent margin.</strong><span className="mt-0.5 block text-xs text-[#697782]">Your own key is kept in macOS Keychain.</span></span><span className="ml-auto text-xs font-medium text-[#496178]">Open settings</span></button>}
      {notice && <div role="alert" className="mb-6 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"><FileWarning size={16}/>{notice}</div>}
      <section><div className="mb-5 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[.16em] text-[#777066]">Local library</h2><span className="text-xs text-[#8a8379]">{books.length} book{books.length === 1 ? "" : "s"}</span></div>
        {!books.length ? <button onClick={() => void upload()} className="flex w-full flex-col items-center rounded-[26px] border border-dashed border-[#cec5b8] bg-white/25 px-6 py-20 text-center hover:bg-white/45"><CloudUpload size={27} className="mb-4 text-[#6d7a89]"/><span className="reader-serif text-2xl">A quiet shelf, for now.</span><span className="mt-2 text-xs text-[#817a70]">Add an EPUB with ⌘O. It stays on this Mac.</span></button> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map((book, index) => <BookCard key={book.id} book={book} index={index} onDelete={() => void remove(book)}/>)}</div>}
      </section>
    </div>
    {searchOpen && <div className="fixed inset-0 z-50 grid place-items-start bg-black/25 px-5 pt-[14vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}><section className="w-full max-w-xl overflow-hidden rounded-2xl bg-[#faf7f0] shadow-2xl"><div className="flex items-center gap-3 border-b border-[#ddd5c9] px-5"><Search size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your library…" className="h-14 flex-1 bg-transparent text-sm outline-none"/><kbd className="rounded border px-1.5 py-0.5 text-[9px]">ESC</kbd></div><div className="max-h-80 overflow-y-auto p-2">{filtered.map((book) => <Link key={book.id} href={`/reader/${book.id}`} className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-[#ebe5da]"><BookOpen size={15}/><span><strong className="block text-sm">{book.title}</strong><small className="text-[#777067]">{book.author}</small></span></Link>)}</div></section></div>}
  </main>;
}

function BookCard({ book, index, onDelete }: { book: LocalBook; index: number; onDelete: () => void }) {
  const palette = ["#304154", "#795347", "#50604d", "#6b5a3c"][index % 4];
  const state = book.status === "ready" ? { icon: <Check size={13}/>, label: "Ready to read" } : book.status === "failed" ? { icon: <FileWarning size={13}/>, label: book.processingError ?? "Import failed" } : { icon: <LoaderCircle className="animate-spin" size={13}/>, label: book.status === "indexing" ? "Building offline index" : book.status === "chunking" ? "Structuring chapters" : "Reading metadata" };
  const content = <div className="group relative flex min-h-52 gap-5 rounded-[22px] border border-[#d9d1c5] bg-[#fbf8f1]/75 p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(54,44,31,.11)]"><div className="w-28 shrink-0 rounded-md p-3 shadow-lg" style={{ backgroundColor: palette }}><div className="flex h-full items-center border border-white/25 p-2 reader-serif text-base leading-tight text-white">{book.title}</div></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between"><div className="min-w-0"><h3 className="truncate reader-serif text-xl">{book.title}</h3><p className="mt-1 truncate text-xs text-[#777168]">{book.author}</p></div><MoreHorizontal size={16} className="text-[#8b857c]"/></div><div className="mt-8 flex items-start gap-1.5 text-xs text-[#657488]">{state.icon}<span className="line-clamp-2">{state.label}</span></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#e0d9ce]"><div className="h-full bg-[#65798e] transition-all" style={{ width: `${book.status === "ready" ? book.progress * 100 : book.processingProgress}%` }}/></div>{book.status === "ready" && <div className="mt-5 flex gap-3 text-[11px]"><Link href={`/book/${book.id}/workspace`} onClick={(event) => event.stopPropagation()} className="text-[#526a82]">Notebook</Link><button onClick={(event) => { event.preventDefault(); onDelete(); }} className="flex items-center gap-1 text-[#8a5b52]"><Trash2 size={11}/> Remove</button></div>}</div></div>;
  return book.status === "ready" ? <Link href={`/reader/${book.id}`}>{content}</Link> : content;
}
