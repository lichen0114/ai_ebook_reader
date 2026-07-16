import { useCallback, useEffect, useState } from "react";
import { Check, Cloud, Cpu, Download, ExternalLink, HardDrive, KeyRound, Laptop, LoaderCircle, RefreshCw, Server, ShieldCheck, Sparkles, Square, Trash2, X } from "lucide-react";
import type { AiSettings, OllamaPullProgress, OllamaStatus, UpdateStatus } from "@/shared/ipc";

type CredentialStatus = { configured: boolean; encryptionAvailable: boolean };

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [credentials, setCredentials] = useState<CredentialStatus>();
  const [settings, setSettings] = useState<AiSettings>();
  const [ollama, setOllama] = useState<OllamaStatus>();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<OllamaPullProgress>();
  const [update, setUpdate] = useState<UpdateStatus>();

  const refreshOllama = useCallback(async () => {
    setRefreshing(true);
    try { setOllama(await window.marginReader.ollama.status()); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    void Promise.all([window.marginReader.credentials.status(), window.marginReader.aiSettings.get(), window.marginReader.ollama.status()]).then(([nextCredentials, nextSettings, nextOllama]) => {
      setCredentials(nextCredentials); setSettings(nextSettings); setOllama(nextOllama);
    });
    const removeUpdate = window.marginReader.updates.onStatus(setUpdate);
    const removePull = window.marginReader.ollama.onPullProgress((next) => {
      setProgress(next);
      if (next.state === "success") {
        setMessage(`${next.model} is ready and selected.`);
        void Promise.all([window.marginReader.aiSettings.get(), window.marginReader.ollama.status()]).then(([nextSettings, nextOllama]) => {
          setSettings(nextSettings); setOllama(nextOllama); notifySettingsChanged();
        });
      }
      if (next.state === "error") setMessage(next.message ?? "The model download failed.");
    });
    return () => { removeUpdate(); removePull(); };
  }, []);

  async function changeSettings(next: AiSettings) {
    setMessage("");
    try { const saved = await window.marginReader.aiSettings.save(next); setSettings(saved); notifySettingsChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "AI settings could not be saved."); }
  }

  async function saveKey() {
    setMessage("");
    try {
      await window.marginReader.credentials.set(apiKey); setApiKey("");
      setCredentials(await window.marginReader.credentials.status());
      setMessage("API key saved securely in macOS Keychain."); notifySettingsChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The key could not be saved."); }
  }

  async function testKey() {
    setChecking(true); setMessage("");
    try { setMessage((await window.marginReader.credentials.test()).message); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Connection test failed."); }
    finally { setChecking(false); }
  }

  async function clearKey() {
    await window.marginReader.credentials.clear(); setCredentials(await window.marginReader.credentials.status());
    setMessage("Saved key removed."); notifySettingsChanged();
  }

  async function startPull(model: "qwen3.5:2b" | "qwen3.5:4b" | "qwen3.5:9b") {
    setMessage("");
    try {
      const requestId = await window.marginReader.ollama.startPull(model);
      setProgress({ requestId, model, status: "starting", completedBytes: 0, totalBytes: null, state: "running", message: null });
    } catch (error) { setMessage(error instanceof Error ? error.message : "The model download could not start."); }
  }

  async function removeModel(model: string) {
    if (!confirm(`Delete “${model}” from Ollama? You can download it again later.`)) return;
    try {
      setSettings(await window.marginReader.ollama.deleteModel(model));
      await refreshOllama(); setMessage(`${model} was removed.`); notifySettingsChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "The model could not be removed."); }
  }

  const provider = settings?.provider;
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-[#1e211f]/45 px-4 py-12 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Settings" className="flex max-h-[min(780px,calc(100vh-72px))] w-full max-w-3xl flex-col overflow-hidden rounded-[26px] border border-[#c9c0b2] bg-[#faf7f0] shadow-[0_30px_90px_rgba(30,27,22,.3)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[#d9d1c6] px-6 py-5 sm:px-8"><div><p className="small-caps text-[10px] text-[#7a7268]">The intelligent margin</p><h1 className="reader-serif mt-1 text-3xl">Choose how it thinks.</h1></div><button onClick={onClose} aria-label="Close settings" className="grid size-9 place-items-center rounded-full hover:bg-black/5"><X size={17}/></button></header>
      <div className="min-h-0 overflow-y-auto p-6 sm:p-8">
        <section aria-labelledby="provider-heading"><div className="mb-4"><h2 id="provider-heading" className="text-sm font-semibold">AI provider</h2><p className="mt-1 text-xs leading-relaxed text-[#736c62]">Switch explicitly at any time. Margin Reader never falls back to another provider.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProviderChoice active={provider === "ollama"} icon={<Laptop size={18}/>} title="Ollama" eyebrow="Local on this Mac" description="Book excerpts stay on loopback and never go to an Ollama cloud model." onClick={() => settings && void changeSettings({ ...settings, provider: "ollama" })}/>
            <ProviderChoice active={provider === "gemini"} icon={<Cloud size={18}/>} title="Gemini" eyebrow="Google AI" description="Uses your own encrypted API key and Gemini 2.5 Flash." onClick={() => settings && void changeSettings({ ...settings, provider: "gemini" })}/>
          </div>
        </section>

        {!settings ? <div className="mt-7 flex items-center gap-2 border-t border-[#ddd5ca] pt-7 text-xs text-[#736c62]"><LoaderCircle className="animate-spin" size={14}/> Loading AI settings…</div> : provider === "gemini" ? <section className="mt-7 border-t border-[#ddd5ca] pt-7"><div className="mb-3 flex items-center gap-2"><KeyRound size={16} className="text-[#52677d]"/><h2 className="text-sm font-semibold">Gemini API key</h2>{credentials?.configured && <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-700"><ShieldCheck size={12}/> Stored in Keychain</span>}</div><p className="mb-4 text-xs leading-relaxed text-[#736c62]">The key is encrypted by macOS and decrypted only for Gemini requests. Permitted excerpts are sent to Google to produce an answer.</p>
          {!credentials?.encryptionAvailable && <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Keychain encryption is unavailable. Margin Reader will not store a plaintext key.</div>}
          <div className="flex gap-2"><input aria-label="Gemini API key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={credentials?.configured ? "Replace saved key…" : "Paste Google AI API key…"} className="h-10 min-w-0 flex-1 rounded-xl border border-[#cdc4b7] bg-white/55 px-3 text-sm outline-none focus:ring-2 focus:ring-[#657b92]/30"/><button disabled={!apiKey.trim() || !credentials?.encryptionAvailable} onClick={() => void saveKey()} className="rounded-xl bg-[#2d3946] px-4 text-xs font-medium text-white disabled:opacity-40">Save</button></div>
          {credentials?.configured && <div className="mt-3 flex gap-3"><button disabled={checking} onClick={() => void testKey()} className="text-xs font-medium text-[#46617c]">{checking ? "Testing…" : "Test connection"}</button><button onClick={() => void clearKey()} className="text-xs text-[#8a5148]">Remove key</button></div>}
        </section> : <OllamaSettings status={ollama} settings={settings} progress={progress} refreshing={refreshing} onRefresh={() => void refreshOllama()} onSelect={(model) => settings && void changeSettings({ ...settings, ollamaModel: model })} onPull={(model) => void startPull(model)} onCancel={() => progress && void window.marginReader.ollama.cancelPull(progress.requestId)} onDelete={(model) => void removeModel(model)}/>} 

        {message && <p role="status" className="mt-5 rounded-xl bg-[#e9eef1] px-4 py-3 text-xs text-[#4e6275]">{message}</p>}
        <section className="mt-7 border-t border-[#ddd5ca] pt-6"><div className="mb-2 flex items-center gap-2"><Sparkles size={16} className="text-[#52677d]"/><h2 className="text-sm font-semibold">App updates</h2></div><p className="text-xs text-[#736c62]">Signed releases are checked after launch and every six hours.</p><div className="mt-3 flex flex-wrap items-center gap-3"><button onClick={() => void window.marginReader.updates.check()} className="flex items-center gap-2 rounded-full border border-[#cfc6b8] px-4 py-2 text-xs"><RefreshCw size={13}/> Check now</button>{update && <span className="text-xs text-[#6d675e]">{update.state === "downloaded" ? `Version ${update.version} is ready` : update.message ?? update.state.replace("-", " ")}</span>}{update?.state === "downloaded" && <button onClick={() => void window.marginReader.updates.install()} className="rounded-full bg-[#2d3946] px-4 py-2 text-xs text-white">Restart to update</button>}</div></section>
      </div>
    </section>
  </div>;
}

function ProviderChoice({ active, icon, title, eyebrow, description, onClick }: { active: boolean; icon: React.ReactNode; title: string; eyebrow: string; description: string; onClick: () => void }) {
  return <button aria-pressed={active} onClick={onClick} className={`relative rounded-2xl border p-4 text-left transition ${active ? "border-[#536b88] bg-[#e7ecef] shadow-[inset_0_0_0_1px_#536b88]" : "border-[#d6cec2] bg-white/35 hover:bg-white/65"}`}><div className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${active ? "bg-[#536b88] text-white" : "bg-[#e8e1d6] text-[#645e55]"}`}>{icon}</span><span><span className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#7a7268]">{eyebrow}</span><strong className="reader-serif mt-0.5 block text-xl font-normal">{title}</strong></span>{active && <Check className="ml-auto text-[#46617c]" size={16}/>}</div><span className="mt-3 block text-xs leading-relaxed text-[#6f685f]">{description}</span></button>;
}

function OllamaSettings({ status, settings, progress, refreshing, onRefresh, onSelect, onPull, onCancel, onDelete }: { status?: OllamaStatus; settings?: AiSettings; progress?: OllamaPullProgress; refreshing: boolean; onRefresh: () => void; onSelect: (model: string | null) => void; onPull: (model: "qwen3.5:2b" | "qwen3.5:4b" | "qwen3.5:9b") => void; onCancel: () => void; onDelete: (model: string) => void }) {
  const activeProgress = progress?.state === "running" ? progress : undefined;
  return <section className="mt-7 border-t border-[#ddd5ca] pt-7">
    <div className="flex flex-wrap items-center gap-3"><span className={`grid size-9 place-items-center rounded-full ${status?.available ? "bg-emerald-100 text-emerald-700" : "bg-[#ebe3d8] text-[#7b6f62]"}`}><Server size={17}/></span><div><h2 className="text-sm font-semibold">Ollama server</h2><p className="mt-0.5 text-[11px] text-[#776f65]">{status?.available ? `Connected · version ${status.version}` : "Not detected at 127.0.0.1:11434"}</p></div><button disabled={refreshing} onClick={onRefresh} className="ml-auto flex items-center gap-1.5 rounded-full border border-[#cec5b8] px-3 py-1.5 text-[11px]"><RefreshCw className={refreshing ? "animate-spin" : ""} size={12}/>{refreshing ? "Checking…" : "Retry"}</button></div>
    {!status?.available ? <div className="mt-5 rounded-2xl border border-[#d4c7b4] bg-[#f2eadc] p-5"><h3 className="reader-serif text-xl">Install or open Ollama first.</h3><p className="mt-2 text-xs leading-relaxed text-[#6f6458]">Ollama is a separate app and currently requires macOS Sonoma 14 or newer. Margin Reader supports older macOS releases, but local AI will remain unavailable there.</p><button onClick={() => void window.marginReader.ollama.openDownloadPage()} className="mt-4 flex items-center gap-2 rounded-full bg-[#34475b] px-4 py-2 text-xs text-white"><ExternalLink size={13}/> Open official Ollama download</button></div> : <>
      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]"><label className="text-xs font-medium">Active local model<select aria-label="Installed Ollama model" value={settings?.ollamaModel ?? ""} onChange={(event) => onSelect(event.target.value || null)} className="mt-2 h-10 w-full rounded-xl border border-[#cdc4b7] bg-white/60 px-3 text-sm"><option value="">Choose an installed model…</option>{status.models.map((model) => <option key={model.name} value={model.name}>{model.name}{model.parameterSize ? ` · ${model.parameterSize}` : ""}</option>)}</select></label><div className="flex items-end gap-2 text-[10px] text-[#746d63]"><HardDrive size={14}/>{formatBytes(status.memoryBytes)} unified memory</div></div>
      {!status.models.length && <p className="mt-3 rounded-xl border border-dashed border-[#cfc5b7] p-3 text-xs text-[#746c62]">No local completion models are installed yet. Choose a size below.</p>}
      <div className="mt-6 flex items-center gap-2"><Cpu size={15} className="text-[#52677d]"/><h3 className="text-xs font-semibold uppercase tracking-[.12em] text-[#625c54]">Curated local models</h3></div><p className="mt-2 text-xs leading-relaxed text-[#746c62]">The recommendation is based on this Mac’s memory. Downloads live in <code>~/.ollama/models</code>, not Margin Reader’s data folder.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{(["qwen3.5:2b", "qwen3.5:4b", "qwen3.5:9b"] as const).map((model) => {
        const curated = curatedInfo(model); const installed = status.models.some((item) => item.name === model); const recommended = status.recommendation.model === model;
        return <article key={model} className={`rounded-2xl border p-4 ${recommended ? "border-[#8da0b1] bg-[#edf1f2]" : "border-[#d7cfc3] bg-white/30"}`}><div className="flex items-start justify-between"><div><span className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#718294]">{recommended ? "Recommended" : curated.tier}</span><h4 className="mt-1 text-sm font-semibold">{curated.label}</h4></div>{installed && <Check size={14} className="text-emerald-700"/>}</div><p className="mt-2 text-[11px] text-[#746d63]">About {curated.size}</p><div className="mt-4 flex gap-2">{installed ? <><button onClick={() => onSelect(model)} className="text-[11px] font-semibold text-[#46617c]">Select</button><button aria-label={`Delete ${model}`} onClick={() => onDelete(model)} className="ml-auto text-[#92594f]"><Trash2 size={14}/></button></> : <button disabled={Boolean(activeProgress)} onClick={() => onPull(model)} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#46617c] disabled:opacity-40"><Download size={13}/> Download</button>}</div></article>;
      })}</div>
      {activeProgress && <div className="mt-4 rounded-2xl border border-[#cbd5dd] bg-[#eaf0f3] p-4"><div className="flex items-center gap-3"><LoaderCircle className="animate-spin text-[#506a81]" size={16}/><div className="min-w-0 flex-1"><div className="flex justify-between text-xs"><strong className="truncate">{activeProgress.model}</strong><span>{activeProgress.totalBytes ? `${Math.min(100, Math.round(activeProgress.completedBytes / activeProgress.totalBytes * 100))}%` : activeProgress.status}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#cbd7df]"><div className="h-full bg-[#526f88] transition-[width]" style={{ width: activeProgress.totalBytes ? `${Math.min(100, activeProgress.completedBytes / activeProgress.totalBytes * 100)}%` : "12%" }}/></div>{activeProgress.totalBytes && <p className="mt-1.5 text-[10px] text-[#677885]">{formatBytes(activeProgress.completedBytes)} of {formatBytes(activeProgress.totalBytes)}</p>}</div><button onClick={onCancel} aria-label="Cancel model download" className="grid size-8 place-items-center rounded-full border border-[#aebdc8]"><Square size={11}/></button></div></div>}
    </>}
  </section>;
}

function curatedInfo(model: string) {
  if (model.endsWith(":2b")) return { label: "Qwen 3.5 · 2B", size: "2.7 GB", tier: "Under 12 GB" };
  if (model.endsWith(":4b")) return { label: "Qwen 3.5 · 4B", size: "3.4 GB", tier: "12–23 GB" };
  return { label: "Qwen 3.5 · 9B", size: "6.6 GB", tier: "24+ GB" };
}
function formatBytes(bytes: number) { return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`; }
function notifySettingsChanged() { window.dispatchEvent(new CustomEvent("margin:ai-settings-changed")); }
