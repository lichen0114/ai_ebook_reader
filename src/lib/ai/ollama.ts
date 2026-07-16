import { randomUUID } from "node:crypto";

export const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const OLLAMA_CONTEXT_TOKENS = 16_384;

export type OllamaModel = {
  name: string;
  size: number;
  modifiedAt: string;
  parameterSize: string | null;
  quantizationLevel: string | null;
};

export type CuratedOllamaModel = {
  model: string;
  label: string;
  approximateBytes: number;
  memoryTier: "compact" | "balanced" | "roomy";
};

export const CURATED_OLLAMA_MODELS: CuratedOllamaModel[] = [
  { model: "qwen3.5:2b", label: "Qwen 3.5 · 2B", approximateBytes: 2_700_000_000, memoryTier: "compact" },
  { model: "qwen3.5:4b", label: "Qwen 3.5 · 4B", approximateBytes: 3_400_000_000, memoryTier: "balanced" },
  { model: "qwen3.5:9b", label: "Qwen 3.5 · 9B", approximateBytes: 6_600_000_000, memoryTier: "roomy" }
];

export type OllamaUsage = { inputTokens: number | null; outputTokens: number | null };
export type OllamaChatRecord = {
  message?: { role?: string; content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
};

export type OllamaPullRecord = {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
};

export function recommendedOllamaModel(memoryBytes: number) {
  if (memoryBytes >= 24 * 1024 ** 3) return CURATED_OLLAMA_MODELS[2];
  if (memoryBytes >= 12 * 1024 ** 3) return CURATED_OLLAMA_MODELS[1];
  return CURATED_OLLAMA_MODELS[0];
}

export function isCloudModel(name: string, details?: Record<string, unknown>) {
  const normalized = name.toLocaleLowerCase();
  return normalized.endsWith(":cloud") || /(?:^|[-_:])cloud(?:$|[-_:])/.test(normalized) || typeof details?.remote_model === "string";
}

export async function readNdjson<T>(
  stream: ReadableStream<Uint8Array>,
  onRecord: (record: T) => void
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) parseNdjsonLine(line, onRecord);
  }
  buffered += decoder.decode();
  if (buffered.trim()) parseNdjsonLine(buffered, onRecord);
}

function parseNdjsonLine<T>(line: string, onRecord: (record: T) => void) {
  if (!line.trim()) return;
  let value: unknown;
  try { value = JSON.parse(line); }
  catch { throw new Error("Ollama returned malformed streaming data."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ollama returned malformed streaming data.");
  onRecord(value as T);
}

export async function streamOllamaChat(
  model: string,
  prompt: string,
  signal: AbortSignal,
  onText: (text: string) => void,
  fetcher: typeof fetch = fetch
): Promise<OllamaUsage> {
  if (!model.trim()) throw new Error("Choose an installed Ollama model in Settings first.");
  if (isCloudModel(model)) throw new Error("Cloud-hosted Ollama models are not supported.");
  const response = await fetcher(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      think: false,
      options: { temperature: 0.2, num_predict: 900, num_ctx: OLLAMA_CONTEXT_TOKENS }
    })
  });
  if (!response.ok || !response.body) throw new Error(await ollamaHttpError(response, "chat"));
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let receivedText = false;
  await readNdjson<OllamaChatRecord>(response.body, (record) => {
    if (record.error) throw new Error(sanitizeOllamaText(record.error));
    const delta = record.message?.content;
    if (typeof delta === "string" && delta) { receivedText = true; onText(delta); }
    if (record.done) {
      inputTokens = finiteCount(record.prompt_eval_count);
      outputTokens = finiteCount(record.eval_count);
    }
  });
  if (!receivedText) throw new Error("Ollama returned an empty response.");
  return { inputTokens, outputTokens };
}

export class OllamaService {
  private readonly fetcher: typeof fetch;
  private activePull: { requestId: string; model: string; controller: AbortController } | null = null;

  constructor(fetcher: typeof fetch = fetch) { this.fetcher = fetcher; }

  getActivePull() { return this.activePull ? { requestId: this.activePull.requestId, model: this.activePull.model } : null; }

  async status(memoryBytes: number) {
    const recommendation = recommendedOllamaModel(memoryBytes);
    try {
      const versionResponse = await this.timedFetch("/api/version");
      if (!versionResponse.ok) throw new Error(`Ollama returned ${versionResponse.status}.`);
      const versionBody = await versionResponse.json() as { version?: unknown };
      const version = typeof versionBody.version === "string" ? versionBody.version.slice(0, 100) : "unknown";
      const models = await this.listModels();
      return { available: true as const, version, models, recommendation, memoryBytes, activePull: this.getActivePull(), error: null };
    } catch (error) {
      return { available: false as const, version: null, models: [] as OllamaModel[], recommendation, memoryBytes, activePull: this.getActivePull(), error: safeOllamaError(error) };
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const response = await this.timedFetch("/api/tags");
    if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
    const body = await response.json() as { models?: unknown };
    if (!Array.isArray(body.models)) return [];
    const inspected = await Promise.all(body.models.slice(0, 100).map(async (candidate): Promise<OllamaModel | null> => {
      if (!candidate || typeof candidate !== "object") return null;
      const raw = candidate as Record<string, unknown>;
      const name = typeof raw.name === "string" ? raw.name : typeof raw.model === "string" ? raw.model : "";
      if (!name || isCloudModel(name, raw)) return null;
      try {
        const show = await this.timedFetch("/api/show", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: name }) });
        if (!show.ok) return null;
        const details = await show.json() as Record<string, unknown>;
        if (isCloudModel(name, details) || !Array.isArray(details.capabilities) || !details.capabilities.includes("completion")) return null;
        const modelDetails = details.details && typeof details.details === "object" ? details.details as Record<string, unknown> : {};
        return {
          name,
          size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : 0,
          modifiedAt: typeof raw.modified_at === "string" ? raw.modified_at : "",
          parameterSize: typeof modelDetails.parameter_size === "string" ? modelDetails.parameter_size : null,
          quantizationLevel: typeof modelDetails.quantization_level === "string" ? modelDetails.quantization_level : null
        };
      } catch { return null; }
    }));
    return inspected.filter((model): model is OllamaModel => Boolean(model)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async startPull(model: string, onProgress: (progress: OllamaPullProgress) => void) {
    if (!CURATED_OLLAMA_MODELS.some((item) => item.model === model)) throw new Error("Only curated local models can be downloaded here.");
    if (this.activePull) throw new Error("Another Ollama model download is already running.");
    const requestId = randomUUID();
    const controller = new AbortController();
    this.activePull = { requestId, model, controller };
    onProgress({ requestId, model, status: "starting", completedBytes: 0, totalBytes: null, state: "running", message: null });
    void this.runPull(requestId, model, controller, onProgress).finally(() => {
      if (this.activePull?.requestId === requestId) this.activePull = null;
    });
    return requestId;
  }

  cancelPull(requestId: string) {
    if (this.activePull?.requestId !== requestId) return false;
    this.activePull.controller.abort();
    return true;
  }

  async deleteModel(model: string) {
    if (!model || isCloudModel(model)) throw new Error("That Ollama model cannot be removed here.");
    const installed = await this.listModels();
    if (!installed.some((item) => item.name === model)) throw new Error("That local model is not installed.");
    const response = await this.fetcher(`${OLLAMA_BASE_URL}/api/delete`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ model }) });
    if (!response.ok) throw new Error(await ollamaHttpError(response, "delete"));
    return true;
  }

  private async runPull(requestId: string, model: string, controller: AbortController, onProgress: (progress: OllamaPullProgress) => void) {
    const layers = new Map<string, { completed: number; total: number }>();
    try {
      const response = await this.fetcher(`${OLLAMA_BASE_URL}/api/pull`, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: true, insecure: false }) });
      if (!response.ok || !response.body) throw new Error(await ollamaHttpError(response, "pull"));
      await readNdjson<OllamaPullRecord>(response.body, (record) => {
        if (record.error) throw new Error(sanitizeOllamaText(record.error));
        if (record.digest && (typeof record.completed === "number" || typeof record.total === "number")) {
          const previous = layers.get(record.digest) ?? { completed: 0, total: 0 };
          layers.set(record.digest, { completed: finiteBytes(record.completed) ?? previous.completed, total: finiteBytes(record.total) ?? previous.total });
        }
        const totals = [...layers.values()].reduce((sum, layer) => ({ completed: sum.completed + layer.completed, total: sum.total + layer.total }), { completed: 0, total: 0 });
        onProgress({ requestId, model, status: sanitizeOllamaText(record.status ?? "downloading"), completedBytes: totals.completed, totalBytes: totals.total || null, state: "running", message: null });
      });
      if (this.activePull?.requestId === requestId) this.activePull = null;
      onProgress({ requestId, model, status: "ready", completedBytes: [...layers.values()].reduce((sum, layer) => sum + layer.completed, 0), totalBytes: [...layers.values()].reduce((sum, layer) => sum + layer.total, 0) || null, state: "success", message: null });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      if (this.activePull?.requestId === requestId) this.activePull = null;
      onProgress({ requestId, model, status: cancelled ? "cancelled" : "failed", completedBytes: 0, totalBytes: null, state: cancelled ? "cancelled" : "error", message: cancelled ? null : safeOllamaError(error) });
    }
  }

  private timedFetch(path: string, init?: RequestInit) {
    return this.fetcher(`${OLLAMA_BASE_URL}${path}`, { ...init, signal: AbortSignal.timeout(2_500) });
  }
}

export type OllamaPullProgress = {
  requestId: string;
  model: string;
  status: string;
  completedBytes: number;
  totalBytes: number | null;
  state: "running" | "success" | "error" | "cancelled";
  message: string | null;
};

async function ollamaHttpError(response: Response, operation: string) {
  let detail = "";
  try { detail = sanitizeOllamaText(await response.text()); } catch { /* no response body */ }
  return `Ollama ${operation} failed (${response.status})${detail ? `: ${detail}` : "."}`;
}

function sanitizeOllamaText(value: string) { return value.replace(/[\r\n\t]+/g, " ").replace(/https?:\/\/\S+/g, "[URL]").trim().slice(0, 300); }
function safeOllamaError(error: unknown) { return sanitizeOllamaText(error instanceof Error ? error.message : "Could not reach Ollama on this Mac.") || "Could not reach Ollama on this Mac."; }
function finiteCount(value: unknown) { return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null; }
function finiteBytes(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
