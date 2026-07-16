import { useEffect, useState } from "react";
import { BookOpen, KeyRound, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { LibraryView } from "@/components/library/library-view";
import { ReaderShell } from "@/components/reader/reader-shell";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import type { LocalBook, UpdateStatus } from "@/shared/ipc";
import { navigate, usePathname } from "./router";

export function App() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [routeBook, setRouteBook] = useState<LocalBook | null | undefined>();

  useEffect(() => window.marginReader.app.onCommand((command) => {
    if (command === "settings") setSettingsOpen(true);
    if (command === "search") window.dispatchEvent(new CustomEvent("margin:search"));
    if (command === "import") {
      void window.marginReader.library.importFile().then((book) => {
        if (book) { navigate("/library"); window.dispatchEvent(new CustomEvent("margin:library-refresh")); }
      });
    }
  }), []);

  useEffect(() => {
    const match = /^\/(?:reader|book)\/([0-9a-f-]+)/i.exec(pathname);
    if (!match) { setRouteBook(undefined); return; }
    setRouteBook(undefined);
    void window.marginReader.library.get(match[1]).then(setRouteBook);
  }, [pathname]);

  let content: React.ReactNode;
  if (pathname === "/" || pathname === "/library") content = <LibraryView onOpenSettings={() => setSettingsOpen(true)} />;
  else if (/^\/reader\//.test(pathname)) content = routeBook === undefined ? <LoadingPage /> : routeBook ? <ReaderShell book={routeBook} onOpenSettings={() => setSettingsOpen(true)} /> : <MissingBook />;
  else if (/^\/book\/[^/]+\/workspace/.test(pathname)) content = routeBook === undefined ? <LoadingPage /> : routeBook ? <WorkspaceView book={routeBook} /> : <MissingBook />;
  else content = <LibraryView onOpenSettings={() => setSettingsOpen(true)} />;

  return <><div className="native-titlebar" aria-hidden="true"><span>Margin Reader</span></div>{content}{settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}</>;
}

function LoadingPage() { return <main className="grid h-dvh place-items-center bg-[#f4efe5]"><BookOpen className="animate-pulse text-[#596b7e]" /></main>; }
function MissingBook() { return <main className="grid h-dvh place-items-center bg-[#f4efe5]"><div className="text-center"><h1 className="reader-serif text-3xl">That book is no longer here.</h1><button onClick={() => navigate("/library")} className="mt-5 rounded-full bg-[#293440] px-5 py-2 text-sm text-white">Return to library</button></div></main>; }

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<{ configured: boolean; encryptionAvailable: boolean }>();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus>();
  useEffect(() => { void window.marginReader.credentials.status().then(setStatus); return window.marginReader.updates.onStatus(setUpdate); }, []);
  async function save() {
    setMessage("");
    try { await window.marginReader.credentials.set(apiKey); setApiKey(""); setStatus(await window.marginReader.credentials.status()); setMessage("API key saved securely in macOS Keychain."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The key could not be saved."); }
  }
  async function test() {
    setChecking(true); setMessage("");
    try { const result = await window.marginReader.credentials.test(); setMessage(result.message); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Connection test failed."); }
    finally { setChecking(false); }
  }
  async function clear() { await window.marginReader.credentials.clear(); setStatus(await window.marginReader.credentials.status()); setMessage("Saved key removed."); }
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-black/30 px-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Settings" className="w-full max-w-lg overflow-hidden rounded-[22px] border border-[#cfc6b8] bg-[#faf7f0] shadow-2xl">
      <header className="flex items-center justify-between border-b border-[#d9d1c6] px-6 py-5"><div><p className="small-caps text-[10px] text-[#7a7268]">Preferences</p><h1 className="reader-serif mt-1 text-2xl">Settings</h1></div><button onClick={onClose} aria-label="Close settings" className="grid size-9 place-items-center rounded-full hover:bg-black/5"><X size={17}/></button></header>
      <div className="space-y-7 p-6">
        <section><div className="mb-3 flex items-center gap-2"><KeyRound size={16} className="text-[#52677d]"/><h2 className="text-sm font-semibold">Gemini API key</h2>{status?.configured && <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-700"><ShieldCheck size={12}/> Stored in Keychain</span>}</div><p className="mb-4 text-xs leading-relaxed text-[#736c62]">Your key is encrypted by macOS and only decrypted for a request. Books and the search index never leave this Mac.</p>
          {!status?.encryptionAvailable && <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Keychain encryption is unavailable. Margin Reader will not store a plaintext key.</div>}
          <div className="flex gap-2"><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status?.configured ? "Replace saved key…" : "Paste Google AI API key…"} className="h-10 min-w-0 flex-1 rounded-xl border border-[#cdc4b7] bg-white/55 px-3 text-sm outline-none focus:ring-2 focus:ring-[#657b92]/30"/><button disabled={!apiKey.trim() || !status?.encryptionAvailable} onClick={() => void save()} className="rounded-xl bg-[#2d3946] px-4 text-xs font-medium text-white disabled:opacity-40">Save</button></div>
          {status?.configured && <div className="mt-3 flex gap-3"><button disabled={checking} onClick={() => void test()} className="text-xs font-medium text-[#46617c]">{checking ? "Testing…" : "Test connection"}</button><button onClick={() => void clear()} className="text-xs text-[#8a5148]">Remove key</button></div>}{message && <p role="status" className="mt-3 text-xs text-[#5e6d7c]">{message}</p>}
        </section>
        <section className="border-t border-[#ddd5ca] pt-6"><div className="mb-2 flex items-center gap-2"><Sparkles size={16} className="text-[#52677d]"/><h2 className="text-sm font-semibold">Updates</h2></div><p className="text-xs text-[#736c62]">Signed releases are checked after launch and every six hours.</p><div className="mt-3 flex items-center gap-3"><button onClick={() => void window.marginReader.updates.check()} className="flex items-center gap-2 rounded-full border border-[#cfc6b8] px-4 py-2 text-xs"><RefreshCw size={13}/> Check now</button>{update && <span className="text-xs text-[#6d675e]">{update.state === "downloaded" ? `Version ${update.version} is ready` : update.message ?? update.state.replace("-", " ")}</span>}{update?.state === "downloaded" && <button onClick={() => void window.marginReader.updates.install()} className="ml-auto rounded-full bg-[#2d3946] px-4 py-2 text-xs text-white">Restart to update</button>}</div></section>
      </div>
    </section>
  </div>;
}
