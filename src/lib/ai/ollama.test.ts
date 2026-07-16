import { describe, expect, it, vi } from "vitest";
import { CURATED_OLLAMA_MODELS, isCloudModel, OllamaService, readNdjson, recommendedOllamaModel, streamOllamaChat, type OllamaPullProgress } from "./ollama";

function fragmentedStream(fragments: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const fragment of fragments) controller.enqueue(new TextEncoder().encode(fragment));
      controller.close();
    }
  });
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("Ollama streaming chat", () => {
  it("parses fragmented and coalesced NDJSON and returns final token counts", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { think: boolean; options: Record<string, number> };
      expect(body).toMatchObject({ think: false, options: { temperature: 0.2, num_predict: 900, num_ctx: 16_384 } });
      return new Response(fragmentedStream([
        "{\"message\":{\"content\":\"Hel",
        "lo\"},\"done\":false}\n{\"message\":{\"content\":\" world\"},\"done\":false}\n{\"done\":true,",
        "\"prompt_eval_count\":31,\"eval_count\":8}\n"
      ]));
    });
    let text = "";
    const usage = await streamOllamaChat("qwen3.5:2b", "Question", new AbortController().signal, (delta) => { text += delta; }, fetcher as typeof fetch);
    expect(text).toBe("Hello world");
    expect(usage).toEqual({ inputTokens: 31, outputTokens: 8 });
  });

  it("rejects empty, malformed, missing-model, cloud-model, and HTTP error responses", async () => {
    const empty = vi.fn(async () => new Response(fragmentedStream(["{\"done\":true}\n"]))) as unknown as typeof fetch;
    await expect(streamOllamaChat("qwen3.5:2b", "Question", new AbortController().signal, () => undefined, empty)).rejects.toThrow("empty response");
    const malformed = vi.fn(async () => new Response(fragmentedStream(["not-json\n"]))) as unknown as typeof fetch;
    await expect(streamOllamaChat("qwen3.5:2b", "Question", new AbortController().signal, () => undefined, malformed)).rejects.toThrow("malformed streaming data");
    await expect(streamOllamaChat("", "Question", new AbortController().signal, () => undefined, empty)).rejects.toThrow("Choose an installed");
    await expect(streamOllamaChat("large:cloud", "Question", new AbortController().signal, () => undefined, empty)).rejects.toThrow("Cloud-hosted");
    const failed = vi.fn(async () => new Response("registry error at https://secret.example/path", { status: 500 })) as unknown as typeof fetch;
    await expect(streamOllamaChat("qwen3.5:2b", "Question", new AbortController().signal, () => undefined, failed)).rejects.toThrow("[URL]");
  });

  it("propagates cancellation", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })) as unknown as typeof fetch;
    const pending = streamOllamaChat("qwen3.5:2b", "Question", controller.signal, () => undefined, fetcher);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("handles a final NDJSON record without a trailing newline", async () => {
    const records: Array<{ value: number }> = [];
    await readNdjson(fragmentedStream(["{\"value\":", "2}"]), (record: { value: number }) => records.push(record));
    expect(records).toEqual([{ value: 2 }]);
  });
});

describe("Ollama discovery and model management", () => {
  it("recommends the curated memory tiers", () => {
    expect(recommendedOllamaModel(8 * 1024 ** 3).model).toBe("qwen3.5:2b");
    expect(recommendedOllamaModel(16 * 1024 ** 3).model).toBe("qwen3.5:4b");
    expect(recommendedOllamaModel(32 * 1024 ** 3).model).toBe("qwen3.5:9b");
    expect(CURATED_OLLAMA_MODELS).toHaveLength(3);
  });

  it("filters cloud and non-completion models during detection", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/version")) return jsonResponse({ version: "0.12.0" });
      if (url.endsWith("/api/tags")) return jsonResponse({ models: [
        { name: "local:latest", size: 12, modified_at: "today" },
        { name: "embedding:latest", size: 3, modified_at: "today" },
        { name: "remote:cloud", size: 0, modified_at: "today" }
      ] });
      if (url.endsWith("/api/show")) {
        const model = (JSON.parse(String(init?.body)) as { model: string }).model;
        return jsonResponse(model === "local:latest" ? { capabilities: ["completion"], details: { parameter_size: "4B", quantization_level: "Q4" } } : { capabilities: ["embedding"] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const status = await new OllamaService(fetcher as typeof fetch).status(16 * 1024 ** 3);
    expect(status).toMatchObject({ available: true, version: "0.12.0", recommendation: { model: "qwen3.5:4b" } });
    expect(status.models).toEqual([{ name: "local:latest", size: 12, modifiedAt: "today", parameterSize: "4B", quantizationLevel: "Q4" }]);
    expect(isCloudModel("remote:cloud")).toBe(true);
    expect(isCloudModel("local", { remote_model: "registry/model" })).toBe(true);
  });

  it("aggregates layer progress and completes a pull", async () => {
    const fetcher = vi.fn(async () => new Response(fragmentedStream([
      "{\"status\":\"pulling\",\"digest\":\"a\",\"completed\":80,\"total\":100}\n",
      "{\"status\":\"pulling\",\"digest\":\"b\",\"completed\":20,\"total\":50}\n",
      "{\"status\":\"success\"}\n"
    ]))) as unknown as typeof fetch;
    const service = new OllamaService(fetcher);
    const events: OllamaPullProgress[] = [];
    await new Promise<void>(async (resolve) => {
      await service.startPull("qwen3.5:2b", (event) => { events.push(event); if (event.state === "success") resolve(); });
    });
    expect(events).toContainEqual(expect.objectContaining({ completedBytes: 100, totalBytes: 150, state: "running" }));
    expect(events.at(-1)).toMatchObject({ state: "success", completedBytes: 100, totalBytes: 150 });
  });

  it("cancels an active pull and permits a later resume", async () => {
    let calls = 0;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls > 1) return new Response(fragmentedStream(["{\"status\":\"success\"}\n"]));
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { init?.signal?.addEventListener("abort", () => controller.error(new Error("cancelled")), { once: true }); } }));
    }) as unknown as typeof fetch;
    const service = new OllamaService(fetcher);
    const cancelled = new Promise<void>(async (resolve) => {
      const requestId = await service.startPull("qwen3.5:2b", (event) => { if (event.state === "cancelled") resolve(); });
      expect(service.cancelPull(requestId)).toBe(true);
    });
    await cancelled;
    await new Promise<void>(async (resolve) => { await service.startPull("qwen3.5:2b", (event) => { if (event.state === "success") resolve(); }); });
    expect(calls).toBe(2);
  });

  it("deletes only an installed local completion model", async () => {
    let deleted = "";
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) return jsonResponse({ models: [{ name: "local:latest", size: 4, modified_at: "today" }] });
      if (url.endsWith("/api/show")) return jsonResponse({ capabilities: ["completion"], details: {} });
      if (url.endsWith("/api/delete")) { deleted = (JSON.parse(String(init?.body)) as { model: string }).model; return jsonResponse({}); }
      throw new Error("Unexpected request");
    });
    const service = new OllamaService(fetcher as typeof fetch);
    await expect(service.deleteModel("missing:latest")).rejects.toThrow("not installed");
    await expect(service.deleteModel("local:latest")).resolves.toBe(true);
    expect(deleted).toBe("local:latest");
  });
});
