import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, CircleStop, Columns2, Highlighter, Languages, Library, Menu, MessageSquareText, Moon, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Sparkles, Sun, TextCursorInput, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { EpubPublicationAdapter } from "@/lib/reader/epub-adapter";
import type { PublicationLocator, ReaderSelection, ReaderStyles, TocItem } from "@/lib/reader/publication-adapter";
import type { ReaderAction, ReaderScope } from "@/lib/ai/types";
import type { AiChunk, Highlight, LocalBook, LocalCitation } from "@/shared/ipc";
import { Link } from "@/renderer/router";

type Settings = ReaderStyles & { width: number; mode: "paginated" | "scrolled-doc" };
type Answer = { text: string; citations: LocalCitation[]; retrieval: "searching" | "ready" };
const defaultSettings: Settings = { fontFamily: "serif", fontSize: 19, lineHeight: 1.72, theme: "paper", width: 720, mode: "paginated" };

export function ReaderShell({ book, onOpenSettings }: { book: LocalBook; onOpenSettings: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<EpubPublicationAdapter | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgress = useRef<{ locator: PublicationLocator; spineIndex: number; blockIndex: number; percentage: number } | undefined>(undefined);
  const requestId = useRef<string | undefined>(undefined);
  const threadId = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toc, setToc] = useState<TocItem[]>(book.chapters);
  const [locator, setLocator] = useState<PublicationLocator>({ type: "epub", href: book.chapters[0]?.href ?? "", spineIndex: 0, blockIndex: 0 });
  const [progress, setProgress] = useState(Math.round(book.progress * 100));
  const [railOpen, setRailOpen] = useState(true);
  const [mobileSheet, setMobileSheet] = useState<"toc" | "appearance" | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const settingsRef = useRef(settings);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [note, setNote] = useState("");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [scope, setScope] = useState<ReaderScope>("read_so_far");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer>();
  const [aiStatus, setAiStatus] = useState<"ready" | "streaming">("ready");
  const [aiError, setAiError] = useState("");
  const [returnLocator, setReturnLocator] = useState<PublicationLocator | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [credentialConfigured, setCredentialConfigured] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([window.marginReader.reader.getProgress(book.id), window.marginReader.highlights.list(book.id), window.marginReader.credentials.status(), window.marginReader.conversations.load(book.id)]).then(([saved, savedHighlights, credential, conversations]) => {
      if (!active) return;
      if (saved?.settings) { setSettings(saved.settings); settingsRef.current = saved.settings; }
      setHighlights(savedHighlights);
      setCredentialConfigured(credential.configured);
      threadId.current = conversations[0]?.id;
    });
    return () => { active = false; };
  }, [book.id]);

  useEffect(() => {
    if (!mountRef.current) return;
    const adapter = new EpubPublicationAdapter();
    adapterRef.current = adapter;
    let active = true;
    void (async () => {
      const saved = await window.marginReader.reader.getProgress(book.id);
      await adapter.open(mountRef.current!, book.originalUrl);
      if (!active) return;
      setToc(adapter.getToc().length ? adapter.getToc() : book.chapters);
      adapter.applyStyles(settingsRef.current);
      adapter.setFlow(settingsRef.current.mode);
      await adapter.display(saved?.locator);
      setReady(true);
    })().catch((caught: unknown) => setLoadError(caught instanceof Error ? caught.message : "The EPUB could not be opened."));
    const removeRelocated = adapter.onRelocated((next, percentage) => {
      setLocator(next);
      setProgress(Math.max(0, Math.min(100, Math.round(percentage * 100))));
      const payload = { locator: next, spineIndex: next.type === "epub" ? next.spineIndex : 0, blockIndex: next.type === "epub" ? next.blockIndex ?? 0 : 0, percentage };
      lastProgress.current = payload;
      if (progressTimer.current) clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => void saveProgress(book.id, payload, settingsRef.current), 350);
    });
    const removeSelection = adapter.onSelection((next) => { setSelection(next); setNoteMode(false); setNote(""); });
    return () => { active = false; removeRelocated(); removeSelection(); adapter.destroy(); if (progressTimer.current) clearTimeout(progressTimer.current); if (lastProgress.current) void saveProgress(book.id, lastProgress.current, settingsRef.current); };
  }, [book.id, book.originalUrl, book.chapters]);

  useEffect(() => {
    settingsRef.current = settings;
    adapterRef.current?.applyStyles(settings);
    adapterRef.current?.setFlow(settings.mode);
    if (lastProgress.current) void saveProgress(book.id, lastProgress.current, settings);
  }, [book.id, settings]);
  useEffect(() => { if (ready) highlights.forEach((highlight) => { if (highlight.locator.cfi) adapterRef.current?.highlight(highlight.locator.cfi, highlight.color); }); }, [ready, highlights]);
  useEffect(() => window.marginReader.ai.onChunk((chunk) => handleAiChunk(chunk)), []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelection(null); setAppearanceOpen(false); setMobileSheet(null); setSearchOpen(false); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "ArrowRight" && !isTyping(event.target)) void adapterRef.current?.next();
      if (event.key === "ArrowLeft" && !isTyping(event.target)) void adapterRef.current?.previous();
    };
    const search = () => setSearchOpen(true);
    window.addEventListener("keydown", key); window.addEventListener("margin:search", search);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("margin:search", search); };
  }, []);

  function handleAiChunk(chunk: AiChunk) {
    if (chunk.requestId !== requestId.current) return;
    if (chunk.type === "retrieval") setAnswer((current) => ({ text: current?.text ?? "", citations: chunk.citations ?? current?.citations ?? [], retrieval: chunk.status }));
    if (chunk.type === "text") setAnswer((current) => ({ text: `${current?.text ?? ""}${chunk.delta}`, citations: current?.citations ?? [], retrieval: current?.retrieval ?? "ready" }));
    if (chunk.type === "done") { threadId.current = chunk.threadId; requestId.current = undefined; setAiStatus("ready"); }
    if (chunk.type === "error") { requestId.current = undefined; setAiStatus("ready"); setAiError(chunk.message); }
  }

  const ask = useCallback(async (action: ReaderAction, text?: string) => {
    const selectedText = selection?.text;
    const prompt = text?.trim() || selectedText || action;
    if (!prompt) return;
    if (!credentialConfigured) { setAiOpen(true); setAiError("Add your Gemini API key in Settings to use the intelligent margin."); return; }
    const effectiveScope = selectedText && action !== "ask" ? "selection" : scope;
    setAiOpen(true); setSelection(null); setQuestion(""); setAiError(""); setAnswer({ text: "", citations: [], retrieval: "searching" }); setAiStatus("streaming");
    try {
      requestId.current = await window.marginReader.ai.start({ bookId: book.id, threadId: threadId.current, question: prompt, action, scope: effectiveScope, currentLocator: locator.type === "epub" ? locator : { type: "epub", href: "", spineIndex: 0 }, currentSpineIndex: locator.type === "epub" ? locator.spineIndex : 0, currentBlockIndex: locator.type === "epub" ? locator.blockIndex ?? 0 : 0, selectedText, targetLanguage: action === "translate" ? "Traditional Chinese" : undefined });
    } catch (error) { setAiStatus("ready"); setAiError(error instanceof Error ? error.message : "The answer could not start."); }
  }, [book.id, credentialConfigured, locator, scope, selection]);

  async function stop() { if (requestId.current) await window.marginReader.ai.cancel(requestId.current); requestId.current = undefined; setAiStatus("ready"); }
  async function saveHighlight(withNote = false) {
    if (!selection || selection.locator.type !== "epub") return;
    const item = await window.marginReader.highlights.create({ id: crypto.randomUUID(), bookId: book.id, exact: selection.text, prefix: selection.locator.quote?.prefix ?? "", suffix: selection.locator.quote?.suffix ?? "", color: "rgba(223, 188, 98, .5)", locator: selection.locator, note: withNote ? note.trim() || null : null });
    setHighlights((items) => [item, ...items]);
    if (item.locator.cfi) adapterRef.current?.highlight(item.locator.cfi, item.color);
    setSelection(null); setNoteMode(false);
  }
  async function openCitation(citation: LocalCitation) { setReturnLocator(adapterRef.current?.getLocator() ?? locator); await adapterRef.current?.display(citation.locator); if (citation.locator.cfi) adapterRef.current?.highlight(citation.locator.cfi, "rgba(91, 130, 167, .42)"); }
  async function backToAnswer() { if (returnLocator) await adapterRef.current?.display(returnLocator); setReturnLocator(null); setAiOpen(true); }
  return <main className="reader-shell flex h-dvh min-h-[560px] w-full flex-col overflow-hidden pt-[40px]" data-reader-theme={settings.theme}>
    <header className="relative z-40 flex h-[58px] shrink-0 items-center border-b border-[var(--reader-border-soft)] bg-[var(--reader-panel)] px-4 text-[var(--reader-fg)] backdrop-blur-xl"><div className="flex flex-1 items-center gap-1"><Link href="/library" aria-label="Back to library" className="reader-icon-button grid size-10 place-items-center rounded-full"><Library size={18}/></Link><IconButton className="reader-icon-button hidden sm:grid" onClick={() => setRailOpen((value) => !value)} aria-label={railOpen ? "Close contents rail" : "Open contents rail"} aria-pressed={railOpen}>{railOpen ? <PanelLeftClose size={18}/> : <PanelLeftOpen size={18}/>}</IconButton><IconButton className="reader-icon-button sm:hidden" onClick={() => setMobileSheet("toc")} aria-label="Open table of contents"><Menu size={19}/></IconButton></div><div className="min-w-0 text-center"><p className="max-w-[45vw] truncate text-[13px] font-medium">{book.title}</p><div className="mx-auto mt-1.5 h-[2px] w-28 overflow-hidden rounded-full bg-[var(--reader-progress-track)]"><div className="h-full bg-[var(--reader-accent)]" style={{ width: `${progress}%` }}/></div></div><div className="flex flex-1 justify-end gap-1"><IconButton className="reader-icon-button" onClick={() => setSearchOpen(true)} aria-label="Search book"><Search size={17}/></IconButton><IconButton className="reader-icon-button" onClick={() => { if (window.matchMedia("(max-width: 639px)").matches) { setAppearanceOpen(false); setMobileSheet("appearance"); } else { setMobileSheet(null); setAppearanceOpen((value) => !value); } }} aria-label="Reading appearance" aria-haspopup="dialog" aria-expanded={appearanceOpen || mobileSheet === "appearance"}><Settings2 size={18}/></IconButton><IconButton onClick={() => setAiOpen((value) => !value)} aria-label="Toggle intelligent margin" aria-pressed={aiOpen} className={`reader-icon-button ${aiOpen ? "bg-[var(--reader-accent-soft)] text-[var(--reader-accent-strong)]" : ""}`}><Sparkles size={17}/></IconButton></div></header>
    <div className="relative flex min-h-0 flex-1 overflow-hidden"><aside role="navigation" aria-label="Book navigation" className={`hidden shrink-0 overflow-hidden border-r border-[var(--reader-border-soft)] bg-[var(--reader-rail)] transition-[width] duration-200 sm:block ${railOpen ? "w-[260px]" : "w-0"}`}><Rail toc={toc} highlights={highlights} onNavigate={(href) => void adapterRef.current?.display(href)}/></aside><section className="relative flex min-w-0 flex-1 flex-col"><div className="reader-progress-label absolute inset-x-0 top-0 z-10 flex justify-center py-2 text-[10px] uppercase tracking-[.12em] text-[var(--reader-muted)]">{progress}% read</div><div className="relative mx-auto h-full w-full" style={{ maxWidth: settings.width + 72 }}>{!ready && !loadError && <div className="absolute inset-0 z-10 grid place-items-center"><div className="text-center"><BookOpen className="mx-auto mb-3 animate-pulse text-[var(--reader-accent)]"/><p className="reader-serif text-lg">Opening the pages…</p></div></div>}{loadError && <div className="absolute inset-0 z-10 grid place-items-center p-8 text-center"><div><p className="reader-serif text-2xl">The EPUB could not be opened.</p><p className="mt-3 text-sm">{loadError}</p><Link href="/library" className="mt-5 inline-block rounded-full bg-[var(--reader-action)] px-5 py-2 text-sm text-[var(--reader-action-fg)]">Return to library</Link></div></div>}<div ref={mountRef} className="h-full w-full px-5 pb-8 pt-10" data-testid="epub-view"/></div><button onClick={() => void adapterRef.current?.previous()} aria-label="Previous page" className="absolute bottom-5 left-4 z-20 grid size-10 place-items-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-panel)] text-[var(--reader-fg)] hover:bg-[var(--reader-hover)]"><ChevronLeft size={18}/></button><button onClick={() => void adapterRef.current?.next()} aria-label="Next page" className="absolute bottom-5 right-4 z-20 grid size-10 place-items-center rounded-full border border-[var(--reader-border)] bg-[var(--reader-panel)] text-[var(--reader-fg)] hover:bg-[var(--reader-hover)]"><ChevronRight size={18}/></button>{returnLocator && <button onClick={() => void backToAnswer()} className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--reader-action)] px-4 py-2 text-xs text-[var(--reader-action-fg)]"><ArrowLeft className="mr-1 inline" size={14}/>Back to answer</button>}</section><aside aria-label="Intelligent margin" className={`absolute inset-y-0 right-0 z-30 w-[min(400px,94vw)] border-l border-[var(--reader-border-soft)] bg-[var(--reader-panel)] shadow-[-18px_0_45px_var(--reader-shadow)] backdrop-blur-xl transition-transform lg:relative lg:shadow-none ${aiOpen ? "translate-x-0" : "translate-x-full lg:hidden"}`}><AiMargin book={book} scope={scope} setScope={setScope} answer={answer} status={aiStatus} error={aiError} question={question} setQuestion={setQuestion} onAsk={(text) => void ask("ask", text)} onStop={() => void stop()} onClose={() => setAiOpen(false)} onCitation={(citation) => void openCitation(citation)} onOpenSettings={onOpenSettings}/></aside>{selection && <SelectionToolbar selection={selection} noteMode={noteMode} note={note} setNote={setNote} setNoteMode={setNoteMode} onClose={() => setSelection(null)} onHighlight={() => void saveHighlight(false)} onNote={() => void saveHighlight(true)} onAction={(action) => void ask(action)}/>}</div>
    {appearanceOpen && <AppearancePopover settings={settings} setSettings={setSettings} onClose={() => setAppearanceOpen(false)}/>}
    {mobileSheet && <MobileSheet title={mobileSheet === "toc" ? "Contents" : "Reading appearance"} onClose={() => setMobileSheet(null)}>{mobileSheet === "toc" ? <Rail toc={toc} highlights={highlights} onNavigate={(href) => { void adapterRef.current?.display(href); setMobileSheet(null); }}/> : <AppearanceControls settings={settings} setSettings={setSettings}/>}</MobileSheet>}
    {searchOpen && <SearchDialog toc={toc} onNavigate={(href) => { void adapterRef.current?.display(href); setSearchOpen(false); }} onClose={() => setSearchOpen(false)}/>}
  </main>;
}

function saveProgress(bookId: string, payload: { locator: PublicationLocator; spineIndex: number; blockIndex: number; percentage: number }, settings: Settings) {
  if (payload.locator.type !== "epub") return Promise.resolve();
  return window.marginReader.reader.saveProgress({ bookId, ...payload, locator: payload.locator, settings }).then(() => undefined);
}

function Rail({ toc, highlights, onNavigate }: { toc: TocItem[]; highlights: Highlight[]; onNavigate: (href: string) => void }) {
  const [tab, setTab] = useState<"contents" | "highlights">("contents");
  return <div className="h-full min-w-[260px] overflow-y-auto p-5"><div role="tablist" aria-label="Reader navigation" className="mb-5 flex gap-1 rounded-lg bg-[var(--reader-border-soft)] p-1"><button role="tab" aria-selected={tab === "contents"} onClick={() => setTab("contents")} className={`flex-1 rounded-md px-2 py-1.5 text-xs ${tab === "contents" ? "bg-[var(--reader-raised)] text-[var(--reader-fg)] shadow-sm" : "text-[var(--reader-muted)] hover:bg-[var(--reader-hover)]"}`}>Contents</button><button role="tab" aria-selected={tab === "highlights"} onClick={() => setTab("highlights")} className={`flex-1 rounded-md px-2 py-1.5 text-xs ${tab === "highlights" ? "bg-[var(--reader-raised)] text-[var(--reader-fg)] shadow-sm" : "text-[var(--reader-muted)] hover:bg-[var(--reader-hover)]"}`}>Highlights</button></div>{tab === "contents" ? <ol className="space-y-1">{toc.map((item, index) => <li key={`${item.href}-${index}`}><button onClick={() => onNavigate(item.href)} className="w-full rounded-lg px-3 py-2.5 text-left text-[13px] text-[var(--reader-fg)] hover:bg-[var(--reader-hover)]"><span className="mr-2 text-[10px] text-[var(--reader-subtle)]">{String(index + 1).padStart(2, "0")}</span>{item.label}</button></li>)}</ol> : !highlights.length ? <div className="py-10 text-center text-[var(--reader-muted)]"><Highlighter className="mx-auto mb-3 text-[var(--reader-subtle)]"/><p className="text-xs">Select a passage to keep it here.</p></div> : highlights.map((item) => <button key={item.id} onClick={() => onNavigate(item.locator.cfi ?? item.locator.href)} className="mb-2 w-full rounded-lg border-l-2 border-[#d3a94e] bg-[var(--reader-raised)] p-3 text-left reader-serif text-sm text-[var(--reader-fg)]">“{item.exact.slice(0, 120)}”</button>)}</div>;
}

function SelectionToolbar({ selection, noteMode, note, setNote, setNoteMode, onClose, onHighlight, onNote, onAction }: { selection: ReaderSelection; noteMode: boolean; note: string; setNote: (value: string) => void; setNoteMode: (value: boolean) => void; onClose: () => void; onHighlight: () => void; onNote: () => void; onAction: (action: ReaderAction) => void }) {
  const left = Math.max(12, Math.min(window.innerWidth - 350, selection.rect.left + selection.rect.width / 2 - 175)); const top = Math.max(70, Math.min(window.innerHeight - 140, selection.rect.top - 58));
  return <div role="toolbar" aria-label="Selected text actions" className="fixed z-[70] w-[350px] rounded-xl border border-[#cfc6b8] bg-[#262b31] p-1.5 text-white shadow-2xl" style={{ left, top }}>{!noteMode ? <div className="flex items-center gap-0.5 overflow-x-auto">{[["Highlight", Highlighter, onHighlight], ["Note", NotebookPen, () => setNoteMode(true)], ["Explain", Sparkles, () => onAction("explain")], ["Define", TextCursorInput, () => onAction("define")], ["Translate", Languages, () => onAction("translate")], ["Ask", MessageSquareText, () => onAction("ask")]].map(([label, Icon, action]) => { const SelectedIcon = Icon as typeof Highlighter; return <button key={String(label)} onClick={action as () => void} className="flex shrink-0 flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[9px] hover:bg-white/10"><SelectedIcon size={15}/>{String(label)}</button>; })}<button onClick={onClose} aria-label="Close selected text actions" className="ml-auto grid size-8 place-items-center"><X size={14}/></button></div> : <div className="p-1"><textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a thought…" className="h-20 w-full resize-none rounded-lg bg-white/10 p-2 text-xs outline-none"/><div className="mt-1 flex justify-end gap-2"><button onClick={() => setNoteMode(false)} className="px-3 py-1 text-xs">Cancel</button><button onClick={onNote} className="rounded-md bg-[#e1bd69] px-3 py-1 text-xs text-[#2b2925]">Save note</button></div></div>}</div>;
}

function AppearancePopover({ settings, setSettings, onClose }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>>; onClose: () => void }) { return <section role="dialog" aria-labelledby="reader-appearance-heading" className="fixed right-14 top-24 z-[80] hidden w-72 rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-panel)] p-5 text-[var(--reader-fg)] shadow-xl shadow-[var(--reader-shadow)] sm:block"><div className="mb-4 flex items-center justify-between"><h2 id="reader-appearance-heading" className="text-sm font-semibold">Reading appearance</h2><button onClick={onClose} aria-label="Close reading appearance" className="reader-icon-button grid size-8 place-items-center rounded-full"><X size={16}/></button></div><AppearanceControls settings={settings} setSettings={setSettings}/></section>; }
function AppearanceControls({ settings, setSettings }: { settings: Settings; setSettings: React.Dispatch<React.SetStateAction<Settings>> }) { return <div className="space-y-5 text-[var(--reader-fg)]"><label className="block text-xs">Text size <span className="float-right text-[var(--reader-muted)]">{settings.fontSize}px</span><input aria-label="Text size" className="mt-2 w-full accent-[var(--reader-accent)]" type="range" min="15" max="27" value={settings.fontSize} onChange={(event) => setSettings((value) => ({ ...value, fontSize: Number(event.target.value) }))}/></label><label className="block text-xs">Line height <span className="float-right text-[var(--reader-muted)]">{settings.lineHeight.toFixed(1)}</span><input aria-label="Line height" className="mt-2 w-full accent-[var(--reader-accent)]" type="range" min="1.3" max="2.1" step=".1" value={settings.lineHeight} onChange={(event) => setSettings((value) => ({ ...value, lineHeight: Number(event.target.value) }))}/></label><div role="group" aria-label="Font family" className="grid grid-cols-2 gap-2"><button aria-pressed={settings.fontFamily === "serif"} onClick={() => setSettings((value) => ({ ...value, fontFamily: "serif" }))} className="reader-choice rounded-lg border border-[var(--reader-border)] p-2 reader-serif text-sm text-[var(--reader-fg)] hover:bg-[var(--reader-hover)]">Serif</button><button aria-pressed={settings.fontFamily === "sans"} onClick={() => setSettings((value) => ({ ...value, fontFamily: "sans" }))} className="reader-choice rounded-lg border border-[var(--reader-border)] p-2 text-sm text-[var(--reader-fg)] hover:bg-[var(--reader-hover)]">Sans</button></div><div role="group" aria-label="Reader theme" className="grid grid-cols-3 gap-2">{(["light", "paper", "dark"] as const).map((theme) => <button key={theme} aria-label={`${theme[0].toUpperCase()}${theme.slice(1)} theme`} aria-pressed={settings.theme === theme} onClick={() => setSettings((value) => ({ ...value, theme }))} className={`reader-theme-choice grid h-10 place-items-center rounded-lg border ${theme === "dark" ? "border-[#4b4d47] bg-[#272825] text-[#ded8cc]" : theme === "paper" ? "border-[#d8d0c2] bg-[#f3ead9] text-[#554f46]" : "border-[#d8d8d5] bg-[#fbfaf7] text-[#4f555b]"}`}>{theme === "dark" ? <Moon size={15}/> : <Sun size={15}/>}</button>)}</div><div role="group" aria-label="Page flow" className="grid grid-cols-2 gap-2"><button aria-pressed={settings.mode === "paginated"} onClick={() => setSettings((value) => ({ ...value, mode: "paginated" }))} className="reader-choice flex items-center justify-center gap-2 rounded-lg border border-[var(--reader-border)] py-2 text-xs text-[var(--reader-fg)] hover:bg-[var(--reader-hover)]"><Columns2 size={14}/>Paginated</button><button aria-pressed={settings.mode === "scrolled-doc"} onClick={() => setSettings((value) => ({ ...value, mode: "scrolled-doc" }))} className="reader-choice rounded-lg border border-[var(--reader-border)] py-2 text-xs text-[var(--reader-fg)] hover:bg-[var(--reader-hover)]">Continuous</button></div></div>; }

function AiMargin({ book, scope, setScope, answer, status, error, question, setQuestion, onAsk, onStop, onClose, onCitation, onOpenSettings }: { book: LocalBook; scope: ReaderScope; setScope: (scope: ReaderScope) => void; answer?: Answer; status: "ready" | "streaming"; error: string; question: string; setQuestion: (value: string) => void; onAsk: (text: string) => void; onStop: () => void; onClose: () => void; onCitation: (citation: LocalCitation) => void; onOpenSettings: () => void }) {
  return <div className="flex h-full flex-col">
    <header className="flex h-[58px] items-center justify-between border-b border-[var(--reader-border-soft)] px-5"><div><p className="text-[13px] font-semibold">Intelligent margin</p><p className="text-[10px] text-[var(--reader-muted)]">Grounded in {book.title}</p></div><IconButton className="reader-icon-button" onClick={onClose} aria-label="Close intelligent margin"><X size={17}/></IconButton></header>
    <div className="flex-1 overflow-y-auto p-5" aria-live="polite"><div className="mb-5 flex items-center justify-between"><label className="text-[10px] font-semibold uppercase tracking-[.13em]" htmlFor="scope">Scope</label><select id="scope" value={scope} onChange={(event) => setScope(event.target.value as ReaderScope)} className="rounded-full border border-[var(--reader-border)] bg-[var(--reader-raised)] px-3 py-1.5 text-xs text-[var(--reader-fg)]"><option value="selection">Selection</option><option value="current_chapter">Current chapter</option><option value="read_so_far">Read so far</option><option value="whole_book">Whole book</option></select></div>{scope === "whole_book" && <div className="mb-5 rounded-xl border border-[var(--reader-warning-border)] bg-[var(--reader-warning-bg)] p-3 text-xs text-[var(--reader-warning-fg)]">This answer may reveal material beyond your current position.</div>}{!answer && <div className="py-10 text-center"><div className="mx-auto mb-5 grid size-12 place-items-center rounded-full bg-[var(--reader-raised)] text-[var(--reader-accent)]"><Sparkles size={19}/></div><h2 className="reader-serif text-2xl">A little help,<br/>then back to the page.</h2><p className="mt-3 text-xs leading-relaxed text-[var(--reader-muted)]">Only bounded excerpts permitted by your spoiler setting are sent to Gemini.</p></div>}{answer && <article><div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[.12em] text-[var(--reader-accent)]"><span className={`size-1.5 rounded-full ${answer.retrieval === "ready" ? "bg-emerald-600" : "animate-pulse bg-[var(--reader-accent)]"}`}/>{answer.retrieval === "ready" ? "Evidence ready" : "Searching permitted text"}</div><h2 className="reader-serif text-xl">What this means</h2><div className="mt-3 reader-serif text-[16px] leading-[1.7]"><CitedText text={answer.text} sources={answer.citations} onCitation={onCitation}/>{status === "streaming" && <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-[var(--reader-accent)]"/>}</div>{answer.citations.length > 0 && <div className="mt-6 border-t border-[var(--reader-border)] pt-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.13em]">Evidence</p>{answer.citations.map((source) => <button key={source.chunkId} onClick={() => onCitation(source)} className="mb-2 w-full rounded-xl border border-[var(--reader-border)] bg-[var(--reader-raised)] p-3 text-left text-[var(--reader-fg)]"><span className="text-[10px] font-semibold text-[var(--reader-accent-strong)]">[{source.sourceId}] · {source.chapterTitle}</span><span className="mt-1 block reader-serif text-xs">“{source.quote}”</span></button>)}</div>}</article>}{error && <div role="alert" className="mt-4 rounded-xl border border-[var(--reader-error-border)] bg-[var(--reader-error-bg)] p-3 text-xs text-[var(--reader-error-fg)]">{error}{error.includes("Settings") && <button onClick={onOpenSettings} className="ml-2 font-semibold underline">Open settings</button>}</div>}</div>
    <form onSubmit={(event) => { event.preventDefault(); if (question.trim()) onAsk(question); }} className="border-t border-[var(--reader-border-soft)] p-4"><div className="flex items-end gap-2 rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-raised)] p-2"><textarea aria-label="Question for intelligent margin" value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} placeholder="Ask about what you’ve read…" className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-[var(--reader-fg)] outline-none placeholder:text-[var(--reader-subtle)]"/>{status === "streaming" ? <button type="button" onClick={onStop} aria-label="Stop answer" className="grid size-9 place-items-center rounded-full bg-[var(--reader-action)] text-[var(--reader-action-fg)]"><CircleStop size={15}/></button> : <button type="submit" disabled={!question.trim()} aria-label="Ask question" className="grid size-9 place-items-center rounded-full bg-[var(--reader-action)] text-[var(--reader-action-fg)] disabled:opacity-35"><Plus size={16}/></button>}</div><p className="mt-2 text-center text-[9px] text-[var(--reader-muted)]">Answers use only permitted excerpts and may be incomplete.</p></form>
  </div>;
}

function CitedText({ text, sources, onCitation }: { text: string; sources: LocalCitation[]; onCitation: (citation: LocalCitation) => void }) { return <>{text.split(/(\[S\d+\])/g).map((part, index) => { const source = sources.find((item) => `[${item.sourceId}]` === part); return source ? <button key={index} onClick={() => onCitation(source)} className="mx-0.5 align-super text-[10px] font-bold text-[var(--reader-accent-strong)] underline">{part}</button> : <span key={index}>{part}</span>; })}</>; }
function MobileSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { const headingId = title === "Contents" ? "reader-contents-heading" : "reader-mobile-appearance-heading"; return <div className="fixed inset-0 z-[90] bg-[var(--reader-overlay)] sm:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby={headingId} className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto rounded-t-[24px] border-t border-[var(--reader-border)] bg-[var(--reader-panel)] p-5 text-[var(--reader-fg)] shadow-[0_-18px_48px_var(--reader-shadow)]"><div className="mb-4 flex items-center justify-between"><h2 id={headingId} className="reader-serif text-xl">{title}</h2><button onClick={onClose} aria-label={`Close ${title.toLowerCase()}`} className="reader-icon-button grid size-8 place-items-center rounded-full"><X size={17}/></button></div>{children}</section></div>; }
function SearchDialog({ toc, onNavigate, onClose }: { toc: TocItem[]; onNavigate: (href: string) => void; onClose: () => void }) { const [query, setQuery] = useState(""); const results = toc.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())); return <div className="fixed inset-0 z-[100] grid place-items-start bg-[var(--reader-overlay)] px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="reader-search-heading" className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--reader-border)] bg-[var(--reader-panel)] text-[var(--reader-fg)] shadow-2xl shadow-[var(--reader-shadow)]"><h2 id="reader-search-heading" className="sr-only">Search book</h2><div className="flex items-center gap-3 border-b border-[var(--reader-border)] px-4 text-[var(--reader-muted)] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--reader-accent)]"><Search className="shrink-0" size={18}/><input aria-label="Search chapter titles" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapter titles…" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-[var(--reader-fg)] outline-none placeholder:text-[var(--reader-subtle)]"/><button onClick={onClose} aria-label="Close search" className="reader-icon-button grid size-8 shrink-0 place-items-center rounded-full"><X size={16}/></button></div><div aria-label="Search results" className="max-h-72 overflow-y-auto p-2">{results.length ? results.map((item) => <button key={item.href} onClick={() => onNavigate(item.href)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-[var(--reader-fg)] hover:bg-[var(--reader-hover)]"><BookOpen className="shrink-0 text-[var(--reader-muted)]" size={15}/><span>{item.label}</span></button>) : <p className="px-4 py-8 text-center text-sm text-[var(--reader-muted)]">No matching chapters.</p>}</div></section></div>; }
function isTyping(target: EventTarget | null) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement; }
