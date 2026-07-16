"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, CircleStop, Columns2, Highlighter, Languages, Library, Menu, MessageSquareText, Moon, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Sparkles, Sun, TextCursorInput, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { EpubPublicationAdapter } from "@/lib/reader/epub-adapter";
import type { PublicationLocator, ReaderSelection, ReaderStyles, TocItem } from "@/lib/reader/publication-adapter";
import type { Citation, ReaderAction, ReaderScope, ReaderUIMessage } from "@/lib/ai/types";

type ReaderBook = { id: string; title: string; author: string; originalUrl: string; chapters: Array<{ id: string; label: string; href: string; spineIndex: number }> };
type StoredHighlight = { id: string; bookId: string; exact: string; locator: PublicationLocator; color: string; note?: string; createdAt: string };
type Settings = ReaderStyles & { width: number; mode: "paginated" | "scrolled-doc" };
const defaultSettings: Settings = { fontFamily: "serif", fontSize: 19, lineHeight: 1.72, theme: "paper", width: 720, mode: "paginated" };

export function ReaderShell({ book }: { book: ReaderBook }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<EpubPublicationAdapter | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgress = useRef<{ locator: PublicationLocator; spineIndex: number; blockIndex: number; percentage: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toc, setToc] = useState<TocItem[]>(book.chapters);
  const [locator, setLocator] = useState<PublicationLocator>({ type: "epub", href: book.chapters[0]?.href ?? "", spineIndex: 0, blockIndex: 0 });
  const [progress, setProgress] = useState(0);
  const [railOpen, setRailOpen] = useState(true);
  const [mobileSheet, setMobileSheet] = useState<"toc" | "appearance" | "notes" | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [note, setNote] = useState("");
  const [highlights, setHighlights] = useState<StoredHighlight[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [scope, setScope] = useState<ReaderScope>("read_so_far");
  const [question, setQuestion] = useState("");
  const [returnLocator, setReturnLocator] = useState<PublicationLocator | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const transport = useMemo(() => new DefaultChatTransport<ReaderUIMessage>({ api: "/api/reader/chat" }), []);
  const { messages, sendMessage, status, stop, error } = useChat<ReaderUIMessage>({ transport, throttle: 45 });

  useEffect(() => {
    const savedSettings = readLocal("margin-reader:settings", defaultSettings);
    const savedHighlights = readLocal<StoredHighlight[]>(`margin-reader:highlights:${book.id}`, []);
    const timer = window.setTimeout(() => { setSettings(savedSettings); setHighlights(savedHighlights); }, 0);
    return () => window.clearTimeout(timer);
  }, [book.id]);

  useEffect(() => {
    if (!mountRef.current) return;
    const adapter = new EpubPublicationAdapter(); adapterRef.current = adapter;
    let active = true;
    void adapter.open(mountRef.current, book.originalUrl).then(async () => {
      if (!active) return;
      setToc(adapter.getToc().length ? adapter.getToc() : book.chapters);
      adapter.applyStyles(settings);
      const saved = localStorage.getItem(`margin-reader:progress:${book.id}`);
      let target: PublicationLocator | undefined;
      if (saved) { try { target = (JSON.parse(saved) as { locator: PublicationLocator }).locator; } catch { /* start at cover */ } }
      await adapter.display(target);
      setReady(true);
    }).catch((caught: unknown) => setLoadError(caught instanceof Error ? caught.message : "The EPUB could not be opened."));
    const removeRelocated = adapter.onRelocated((next, percentage) => {
      setLocator(next); setProgress(Math.max(0, Math.min(100, Math.round(percentage * 100))));
      const payload = { locator: next, spineIndex: next.type === "epub" ? next.spineIndex : 0, blockIndex: next.type === "epub" ? next.blockIndex ?? 0 : 0, percentage };
      lastProgress.current = payload;
      if (progressTimer.current) clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => { localStorage.setItem(`margin-reader:progress:${book.id}`, JSON.stringify({ ...payload, updatedAt: new Date().toISOString() })); void fetch(`/api/books/${book.id}/progress`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), keepalive: true }); }, 350);
    });
    const removeSelection = adapter.onSelection((next) => { setSelection(next); setNoteMode(false); setNote(""); });
    return () => { active = false; removeRelocated(); removeSelection(); adapter.destroy(); if (progressTimer.current) clearTimeout(progressTimer.current); };
  // The EPUB renderer must initialize once per publication; styles update separately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, book.originalUrl]);

  useEffect(() => { adapterRef.current?.applyStyles(settings); adapterRef.current?.setFlow(settings.mode); localStorage.setItem("margin-reader:settings", JSON.stringify(settings)); }, [settings]);
  useEffect(() => { const flush = () => { if (document.visibilityState !== "hidden" || !lastProgress.current) return; localStorage.setItem(`margin-reader:progress:${book.id}`, JSON.stringify({ ...lastProgress.current, updatedAt: new Date().toISOString() })); void fetch(`/api/books/${book.id}/progress`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(lastProgress.current), keepalive: true }); }; document.addEventListener("visibilitychange", flush); return () => document.removeEventListener("visibilitychange", flush); }, [book.id]);
  useEffect(() => { if (!ready) return; highlights.forEach((highlight) => { if (highlight.locator.type === "epub" && highlight.locator.cfi) adapterRef.current?.highlight(highlight.locator.cfi, highlight.color); }); }, [ready, highlights]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelection(null); setAppearanceOpen(false); setMobileSheet(null); setSearchOpen(false); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "ArrowRight" && !isTyping(event.target)) void adapterRef.current?.next();
      if (event.key === "ArrowLeft" && !isTyping(event.target)) void adapterRef.current?.previous();
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);

  const ask = useCallback(async (action: ReaderAction, text?: string) => {
    const selectedText = selection?.text;
    const prompt = text?.trim() || selectedText || action;
    if (!prompt) return;
    const effectiveScope = selectedText && action !== "ask" ? "selection" : scope;
    setAiOpen(true); setSelection(null); setQuestion("");
    await sendMessage({ text: prompt, metadata: { action, scope: effectiveScope, createdAt: new Date().toISOString() } }, { body: { bookId: book.id, action, scope: effectiveScope, currentLocator: locator, currentSpineIndex: locator.type === "epub" ? locator.spineIndex : 0, currentBlockIndex: locator.type === "epub" ? locator.blockIndex ?? 0 : 0, selectedText, selectionLocator: selection?.locator, targetLanguage: action === "translate" ? "Traditional Chinese" : undefined } });
  }, [book.id, locator, scope, selection, sendMessage]);

  function saveHighlight(withNote = false) {
    if (!selection) return;
    const item: StoredHighlight = { id: crypto.randomUUID(), bookId: book.id, exact: selection.text, locator: selection.locator, color: "rgba(223, 188, 98, .5)", note: withNote ? note.trim() : undefined, createdAt: new Date().toISOString() };
    const next = [item, ...highlights]; setHighlights(next); localStorage.setItem(`margin-reader:highlights:${book.id}`, JSON.stringify(next));
    void fetch(`/api/books/${book.id}/highlights`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, exact: item.exact, prefix: item.locator.quote?.prefix ?? "", suffix: item.locator.quote?.suffix ?? "", color: "ochre", locator: item.locator, note: item.note }) });
    if (item.locator.type === "epub" && item.locator.cfi) adapterRef.current?.highlight(item.locator.cfi, item.color);
    setSelection(null); setNoteMode(false);
  }

  async function openCitation(citation: Citation) { setReturnLocator(adapterRef.current?.getLocator() ?? locator); await adapterRef.current?.display(citation.locator); if (citation.locator.type === "epub" && citation.locator.cfi) adapterRef.current?.highlight(citation.locator.cfi, "rgba(91, 130, 167, .42)"); }
  async function backToAnswer() { if (returnLocator) await adapterRef.current?.display(returnLocator); setReturnLocator(null); setAiOpen(true); }
  const themeClass = settings.theme === "dark" ? "bg-[#20211f] text-[#ded8cc]" : settings.theme === "light" ? "bg-[#fbfaf7]" : "bg-[#f5f0e7]";

  return <main className={`flex h-dvh min-h-[560px] w-full flex-col overflow-hidden ${themeClass}`}>
    <header className="relative z-40 flex h-[58px] shrink-0 items-center border-b border-black/10 bg-[var(--panel)] px-2 backdrop-blur-xl sm:px-4">
      <div className="flex flex-1 items-center gap-1"><Link href="/library" aria-label="Back to library" className="grid size-10 place-items-center rounded-full text-[#555047] hover:bg-white/60"><Library size={18} /></Link><IconButton className="hidden sm:grid" onClick={() => setRailOpen((value) => !value)} aria-label={railOpen ? "Close contents rail" : "Open contents rail"}>{railOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</IconButton><IconButton className="sm:hidden" onClick={() => setMobileSheet("toc")} aria-label="Open table of contents"><Menu size={19} /></IconButton></div>
      <div className="min-w-0 text-center"><p className="max-w-[45vw] truncate text-[13px] font-medium">{book.title}</p><div className="mx-auto mt-1.5 h-[2px] w-28 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-[#60758d]" style={{ width: `${progress}%` }} /></div></div>
      <div className="flex flex-1 justify-end gap-1"><IconButton onClick={() => setSearchOpen(true)} aria-label="Search book"><Search size={17} /></IconButton><IconButton onClick={() => setAppearanceOpen((value) => !value)} aria-label="Reading appearance"><Settings2 size={18} /></IconButton><IconButton onClick={() => setAiOpen((value) => !value)} aria-label={aiOpen ? "Close intelligent margin" : "Open intelligent margin"} className={aiOpen ? "bg-[#dde4ea] text-[#34465a]" : ""}><Sparkles size={17} /></IconButton></div>
    </header>

    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <aside className={`hidden shrink-0 overflow-hidden border-r border-black/10 bg-black/[.018] transition-[width] duration-200 sm:block ${railOpen ? "w-[260px]" : "w-0"}`} aria-label="Book navigation"><Rail toc={toc} highlights={highlights} onNavigate={(href) => void adapterRef.current?.display(href)} /></aside>
      <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Reading canvas">
        <div className="absolute inset-x-0 top-0 z-10 flex justify-center bg-gradient-to-b from-black/[.035] to-transparent py-2 text-[10px] uppercase tracking-[.12em] text-[#827b71]"><span>{progress}% read</span></div>
        <div className="relative mx-auto h-full w-full transition-[max-width] duration-200" style={{ maxWidth: settings.width + 72 }}>
          {!ready && !loadError && <div className="absolute inset-0 z-10 grid place-items-center"><div className="text-center"><BookOpen className="mx-auto mb-3 animate-pulse text-[#657488]" size={26} /><p className="reader-serif text-lg">Opening the pages…</p></div></div>}
          {loadError && <div role="alert" className="absolute inset-0 z-10 grid place-items-center p-8"><div className="max-w-sm text-center"><p className="reader-serif text-2xl">The EPUB could not be opened.</p><p className="mt-3 text-sm text-[#756f67]">{loadError}</p><Link href="/library" className="mt-5 inline-block rounded-full bg-[#2c3541] px-5 py-2 text-sm text-white">Return to library</Link></div></div>}
          <div ref={mountRef} className="h-full w-full px-5 pb-8 pt-10 sm:px-8" data-testid="epub-view" />
        </div>
        <button onClick={() => void adapterRef.current?.previous()} aria-label="Previous page" className="absolute bottom-5 left-4 z-20 grid size-10 place-items-center rounded-full border border-black/10 bg-[var(--panel)] text-[#676159] shadow-sm hover:bg-white"><ChevronLeft size={18} /></button>
        <button onClick={() => void adapterRef.current?.next()} aria-label="Next page" className="absolute bottom-5 right-4 z-20 grid size-10 place-items-center rounded-full border border-black/10 bg-[var(--panel)] text-[#676159] shadow-sm hover:bg-white"><ChevronRight size={18} /></button>
        {returnLocator && <button onClick={() => void backToAnswer()} className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#34475b] px-4 py-2 text-xs font-medium text-white shadow-lg"><ArrowLeft className="mr-1.5 inline" size={14}/> Back to answer</button>}
      </section>
      <aside className={`absolute inset-y-0 right-0 z-30 w-[min(400px,94vw)] border-l border-black/10 bg-[var(--panel)] shadow-[-18px_0_45px_rgba(38,32,24,.08)] backdrop-blur-xl transition-transform duration-200 lg:relative lg:shadow-none ${aiOpen ? "translate-x-0" : "translate-x-full lg:hidden"}`} aria-label="Intelligent margin"><AiMargin book={book} scope={scope} setScope={setScope} messages={messages} status={status} error={error?.message} question={question} setQuestion={setQuestion} onAsk={(text) => void ask("ask", text)} onStop={() => void stop()} onClose={() => setAiOpen(false)} onCitation={(citation) => void openCitation(citation)} /></aside>
      {selection && <SelectionToolbar selection={selection} noteMode={noteMode} note={note} setNote={setNote} setNoteMode={setNoteMode} onClose={() => setSelection(null)} onHighlight={() => saveHighlight(false)} onNote={() => saveHighlight(true)} onAction={(action) => void ask(action)} />}
    </div>
    {appearanceOpen && <AppearancePopover settings={settings} setSettings={setSettings} onClose={() => setAppearanceOpen(false)} />}
    {mobileSheet && <MobileSheet title={mobileSheet === "toc" ? "Contents" : mobileSheet === "notes" ? "Highlights & notes" : "Appearance"} onClose={() => setMobileSheet(null)}>{mobileSheet === "toc" ? <Rail toc={toc} highlights={highlights} onNavigate={(href) => { void adapterRef.current?.display(href); setMobileSheet(null); }} /> : <AppearanceControls settings={settings} setSettings={setSettings} />}</MobileSheet>}
    {searchOpen && <SearchDialog toc={toc} onNavigate={(href) => { void adapterRef.current?.display(href); setSearchOpen(false); }} onClose={() => setSearchOpen(false)} />}
  </main>;
}

function Rail({ toc, highlights, onNavigate }: { toc: TocItem[]; highlights: StoredHighlight[]; onNavigate: (href: string) => void }) {
  const [tab, setTab] = useState<"contents" | "highlights">("contents");
  return <div className="h-full min-w-[260px] overflow-y-auto p-5"><div className="mb-5 flex gap-1 rounded-lg bg-black/[.04] p-1"><button onClick={() => setTab("contents")} className={`flex-1 rounded-md px-2 py-1.5 text-xs ${tab === "contents" ? "bg-white/70 shadow-sm" : "text-[#756f66]"}`}>Contents</button><button onClick={() => setTab("highlights")} className={`flex-1 rounded-md px-2 py-1.5 text-xs ${tab === "highlights" ? "bg-white/70 shadow-sm" : "text-[#756f66]"}`}>Highlights</button></div>{tab === "contents" ? <nav><p className="small-caps mb-4 text-[10px] text-[#8b8378]">In this book</p><ol className="space-y-1">{toc.map((item, index) => <li key={`${item.href}-${index}`}><button onClick={() => onNavigate(item.href)} className="w-full rounded-lg px-3 py-2.5 text-left text-[13px] leading-snug text-[#5c574f] hover:bg-white/60"><span className="mr-2 text-[10px] text-[#9b9287]">{String(index + 1).padStart(2, "0")}</span>{item.label}</button></li>)}</ol></nav> : <div>{!highlights.length ? <div className="py-10 text-center"><Highlighter className="mx-auto mb-3 text-[#9a9185]" size={21}/><p className="text-xs text-[#756f67]">Select a passage to keep it here.</p></div> : highlights.map((item) => <button key={item.id} onClick={() => item.locator.type === "epub" && onNavigate(item.locator.cfi ?? item.locator.href)} className="mb-2 w-full rounded-lg border-l-2 border-[#d3a94e] bg-white/30 p-3 text-left reader-serif text-sm leading-relaxed">“{item.exact.slice(0, 120)}{item.exact.length > 120 ? "…" : ""}”{item.note && <span className="mt-2 block font-sans text-xs text-[#756f67]">{item.note}</span>}</button>)}</div>}</div>;
}

function SelectionToolbar({ selection, noteMode, note, setNote, setNoteMode, onClose, onHighlight, onNote, onAction }: { selection: ReaderSelection; noteMode: boolean; note: string; setNote: (value: string) => void; setNoteMode: (value: boolean) => void; onClose: () => void; onHighlight: () => void; onNote: () => void; onAction: (action: ReaderAction) => void }) {
  const left = Math.max(12, Math.min(window.innerWidth - 350, selection.rect.left + selection.rect.width / 2 - 175));
  const top = Math.max(70, Math.min(window.innerHeight - 140, selection.rect.top - 58));
  return <div role="toolbar" aria-label="Selected passage actions" className="fixed z-[70] w-[350px] rounded-xl border border-[#cfc6b8] bg-[#262b31] p-1.5 text-white shadow-2xl animate-rise" style={{ left, top }}>
    {!noteMode ? <div className="flex items-center gap-0.5 overflow-x-auto hide-scrollbar">{[
      ["Highlight", Highlighter, onHighlight], ["Note", NotebookPen, () => setNoteMode(true)], ["Explain", Sparkles, () => onAction("explain")], ["Define", TextCursorInput, () => onAction("define")], ["Translate", Languages, () => onAction("translate")], ["Ask", MessageSquareText, () => onAction("ask")]
    ].map(([label, Icon, action]) => { const SelectedIcon = Icon as typeof Highlighter; return <button key={String(label)} onClick={action as () => void} className="flex shrink-0 flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[9px] text-[#ece8e0] hover:bg-white/10"><SelectedIcon size={15}/>{String(label)}</button>; })}<button onClick={onClose} aria-label="Close selection toolbar" className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg hover:bg-white/10"><X size={14}/></button></div> : <div className="p-1"><label className="sr-only" htmlFor="selection-note">Note</label><textarea id="selection-note" autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a thought…" className="h-20 w-full resize-none rounded-lg bg-white/10 p-2 text-xs outline-none placeholder:text-white/40"/><div className="mt-1 flex justify-end gap-2"><button onClick={() => setNoteMode(false)} className="px-3 py-1 text-xs text-white/70">Cancel</button><button onClick={onNote} className="rounded-md bg-[#e1bd69] px-3 py-1 text-xs font-medium text-[#2b2925]">Save note</button></div></div>}
  </div>;
}

function AppearancePopover({ settings, setSettings, onClose }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>>; onClose: () => void }) { return <div className="fixed right-14 top-14 z-[80] w-72 rounded-2xl border border-[#d3cbbf] bg-[#faf7f0] p-5 text-[#292722] shadow-xl animate-rise"><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold">Reading appearance</h2><button onClick={onClose} aria-label="Close appearance"><X size={16}/></button></div><AppearanceControls settings={settings} setSettings={setSettings}/></div>; }
function AppearanceControls({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) { return <div className="space-y-5"><div><label className="mb-2 flex justify-between text-xs text-[#6d675e]">Text size <span>{settings.fontSize}px</span></label><input aria-label="Font size" type="range" min="15" max="27" value={settings.fontSize} onChange={(event) => setSettings((value) => ({ ...value, fontSize: Number(event.target.value) }))} className="w-full accent-[#526a83]"/></div><div><label className="mb-2 flex justify-between text-xs text-[#6d675e]">Line height <span>{settings.lineHeight.toFixed(1)}</span></label><input aria-label="Line height" type="range" min="1.3" max="2.1" step=".1" value={settings.lineHeight} onChange={(event) => setSettings((value) => ({ ...value, lineHeight: Number(event.target.value) }))} className="w-full accent-[#526a83]"/></div><div><label className="mb-2 flex justify-between text-xs text-[#6d675e]">Reading width <span>{settings.width}px</span></label><input aria-label="Reading width" type="range" min="560" max="860" step="20" value={settings.width} onChange={(event) => setSettings((value) => ({ ...value, width: Number(event.target.value) }))} className="w-full accent-[#526a83]"/></div><div className="grid grid-cols-2 gap-2"><button onClick={() => setSettings((value) => ({ ...value, fontFamily: "serif" }))} className={`rounded-lg border p-2 reader-serif text-sm ${settings.fontFamily === "serif" ? "border-[#536a82] bg-[#e6ebef]" : "border-[#d7cfc3]"}`}>Serif</button><button onClick={() => setSettings((value) => ({ ...value, fontFamily: "sans" }))} className={`rounded-lg border p-2 text-sm ${settings.fontFamily === "sans" ? "border-[#536a82] bg-[#e6ebef]" : "border-[#d7cfc3]"}`}>Sans</button></div><div className="grid grid-cols-3 gap-2">{(["light", "paper", "dark"] as const).map((theme) => <button key={theme} onClick={() => setSettings((value) => ({ ...value, theme }))} aria-label={`${theme} theme`} className={`grid h-10 place-items-center rounded-lg border ${settings.theme === theme ? "border-[#536a82] ring-1 ring-[#536a82]" : "border-[#d7cfc3]"} ${theme === "dark" ? "bg-[#272825] text-white" : theme === "paper" ? "bg-[#f3ead9]" : "bg-white"}`}>{theme === "dark" ? <Moon size={15}/> : <Sun size={15}/>}</button>)}</div><button onClick={() => setSettings((value) => ({ ...value, mode: value.mode === "paginated" ? "scrolled-doc" : "paginated" }))} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#d7cfc3] py-2 text-xs"><Columns2 size={14}/>{settings.mode === "paginated" ? "Paginated" : "Continuous scroll"}</button></div>; }

function AiMargin({ book, scope, setScope, messages, status, error, question, setQuestion, onAsk, onStop, onClose, onCitation }: { book: ReaderBook; scope: ReaderScope; setScope: (scope: ReaderScope) => void; messages: ReaderUIMessage[]; status: string; error?: string; question: string; setQuestion: (value: string) => void; onAsk: (text: string) => void; onStop: () => void; onClose: () => void; onCitation: (citation: Citation) => void }) {
  const latest = [...messages].reverse().find((message) => message.role === "assistant");
  const sources = latest?.parts.find((part) => part.type === "data-sources");
  const retrieval = latest?.parts.find((part) => part.type === "data-retrieval");
  const text = latest?.parts.filter((part) => part.type === "text").map((part) => part.text).join("") ?? "";
  return <div className="flex h-full flex-col"><header className="flex h-[58px] shrink-0 items-center justify-between border-b border-black/10 px-5"><div><p className="text-[13px] font-semibold">Intelligent margin</p><p className="mt-0.5 text-[10px] text-[#7d766c]">Grounded in {book.title}</p></div><IconButton onClick={onClose} aria-label="Close intelligent margin"><X size={17}/></IconButton></header><div className="flex-1 overflow-y-auto p-5" aria-live="polite"><div className="mb-5 flex items-center justify-between"><label className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#7c756b]" htmlFor="scope">Scope</label><select id="scope" value={scope} onChange={(event) => setScope(event.target.value as ReaderScope)} className="rounded-full border border-[#d1c9bd] bg-transparent px-3 py-1.5 text-xs"><option value="selection">Selection</option><option value="current_chapter">Current chapter</option><option value="read_so_far">Read so far</option><option value="whole_book">Whole book</option></select></div>{scope === "whole_book" && <div role="status" className="mb-5 rounded-xl border border-[#d5b870] bg-[#fbf2d8] p-3 text-xs leading-relaxed text-[#6c5422]">This answer may reveal material beyond your current position.</div>}{!latest && <div className="py-10 text-center"><div className="mx-auto mb-5 grid size-12 place-items-center rounded-full border border-[#ccd3da] bg-[#edf0f2]"><Sparkles size={19} className="text-[#4d6075]"/></div><h2 className="reader-serif text-2xl">A little help,<br/>then back to the page.</h2><p className="mx-auto mt-3 max-w-[270px] text-xs leading-relaxed text-[#746e65]">Select a passage for a concise explanation, or ask about what you have read so far.</p></div>}{latest && <article className="animate-rise"><div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[.12em] text-[#6e7c8a]"><span className={`size-1.5 rounded-full ${retrieval?.data.status === "ready" ? "bg-emerald-600" : "animate-pulse bg-[#65798e]"}`}/>{retrieval?.data.status === "ready" ? "Evidence ready" : "Searching permitted text"}</div><h2 className="reader-serif text-xl">What this means</h2><div className="mt-3 reader-serif text-[16px] leading-[1.7] text-[#3f3b35]"><CitedText text={text} sources={sources?.data.items ?? []} onCitation={onCitation}/>{status === "streaming" && <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-[#52677e]"/>}</div>{sources && sources.data.items.length > 0 && <div className="mt-6 border-t border-black/10 pt-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.13em] text-[#7b746a]">Evidence</p><div className="space-y-2">{sources.data.items.map((source, index) => <button key={source.chunkId} onClick={() => onCitation(source)} className="w-full rounded-xl border border-[#d9d1c5] bg-white/35 p-3 text-left hover:bg-white/70" aria-label={`Open source ${index + 1}, ${source.chapterTitle}`}><span className="text-[10px] font-semibold text-[#52677e]">[{source.sourceId}] · {source.chapterTitle}</span><span className="mt-1 block reader-serif text-xs leading-relaxed text-[#5f5951]">“{source.quote}”</span></button>)}</div></div>}<div className="mt-5 flex items-center gap-2 text-[10px] text-[#777168]"><span className="rounded-full border border-[#d5cec3] px-2 py-1">{scopeLabel(scope)}</span><span>Evidence type: Directly stated</span></div></article>}{error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">The AI provider is unavailable. Reading and highlights still work. {error}</div>}</div><form onSubmit={(event) => { event.preventDefault(); if (question.trim()) onAsk(question); }} className="shrink-0 border-t border-black/10 p-4"><div className="flex items-end gap-2 rounded-2xl border border-[#cbc2b5] bg-white/45 p-2 focus-within:ring-2 focus-within:ring-[#6d8299]/30"><textarea aria-label="Ask about the book" value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} placeholder="Ask about what you’ve read…" className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-[#9a9389]"/>{status === "streaming" ? <button type="button" onClick={onStop} aria-label="Stop response" className="grid size-9 place-items-center rounded-full bg-[#3a4653] text-white"><CircleStop size={15}/></button> : <button type="submit" disabled={!question.trim()} aria-label="Send question" className="grid size-9 place-items-center rounded-full bg-[#3a4653] text-white disabled:opacity-35"><Plus size={16}/></button>}</div><p className="mt-2 text-center text-[9px] text-[#8c857b]">Answers use only permitted excerpts and may be incomplete.</p></form></div>;
}

function CitedText({ text, sources, onCitation }: { text: string; sources: Citation[]; onCitation: (citation: Citation) => void }) { const parts = text.split(/(\[S\d+\])/g); return <>{parts.map((part, index) => { const match = /^\[(S\d+)\]$/.exec(part); if (!match) return <span key={index}>{part}</span>; const source = sources.find((item) => item.sourceId === match[1]); return source ? <button key={index} onClick={() => onCitation(source)} className="mx-0.5 align-super text-[10px] font-bold text-[#46627e] underline decoration-[#8398ac] underline-offset-2" aria-label={`Open ${source.sourceId}, ${source.chapterTitle}`}>{part}</button> : null; })}</>; }
function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[90] bg-black/30 sm:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-[24px] bg-[#f8f4ec] p-5 shadow-2xl"><div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#b7afa4]"/><div className="mb-3 flex items-center justify-between"><h2 className="reader-serif text-xl">{title}</h2><IconButton onClick={onClose} aria-label={`Close ${title}`}><X size={17}/></IconButton></div>{children}</section></div>; }
function SearchDialog({ toc, onNavigate, onClose }: { toc: TocItem[]; onNavigate: (href: string) => void; onClose: () => void }) { const [query, setQuery] = useState(""); const results = toc.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())); return <div className="fixed inset-0 z-[100] grid place-items-start bg-black/30 px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label="Search this book" className="w-full max-w-xl overflow-hidden rounded-2xl bg-[#faf7f0] shadow-2xl"><div className="flex items-center gap-3 border-b border-[#ddd5c9] px-5"><Search size={18} className="text-[#787168]"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapter titles…" className="h-14 flex-1 bg-transparent text-sm outline-none"/><kbd className="rounded border border-[#d2c9bd] px-1.5 py-0.5 text-[9px] text-[#817a70]">ESC</kbd></div><div className="max-h-72 overflow-y-auto p-2">{results.map((item) => <button key={item.href} onClick={() => onNavigate(item.href)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm hover:bg-[#ebe5da]"><BookOpen size={15} className="text-[#69798b]"/>{item.label}</button>)}{!results.length && <p className="p-8 text-center text-sm text-[#7c756c]">No matching chapter.</p>}</div></section></div>; }
function scopeLabel(scope: ReaderScope) { return ({ selection: "Selection", current_chapter: "Current chapter", read_so_far: "Read so far", whole_book: "Whole book" })[scope]; }
function isTyping(target: EventTarget | null) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement; }
function readLocal<T>(key: string, fallback: T): T { if (typeof window === "undefined") return fallback; const value = localStorage.getItem(key); if (!value) return fallback; try { return JSON.parse(value) as T; } catch { return fallback; } }
