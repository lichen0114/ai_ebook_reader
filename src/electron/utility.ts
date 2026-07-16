import { randomUUID } from "node:crypto";
import { LocalRepository } from "@/lib/db/local-repository";
import { filterHistoryForScope } from "@/lib/ai/retrieve";
import { readerInstructions } from "@/lib/ai/instructions";
import { requestSchemas, responseSchemas, type AiChunk, type AiRequest, type Conversation, type UtilityOperation } from "@/shared/ipc";

type RpcRequest = { id: string; operation: UtilityOperation; payload: unknown };
type RpcResponse = { id: string; ok: true; result: unknown } | { id: string; ok: false; error: string };
type UtilityEvent = { type: "event"; channel: "ai" | "import"; payload: unknown };

const userDataPath = process.env.MARGIN_READER_USER_DATA;
if (!userDataPath) throw new Error("Missing local data directory.");
const repository = new LocalRepository(userDataPath);
const activeRequests = new Map<string, AbortController>();
const startTimes: number[] = [];
const keepAlive = setInterval(() => undefined, 60_000);
process.parentPort.on("message", (event) => void handleRequest(event.data as RpcRequest));
void repository.resumeInterrupted((book) => emit("import", { bookId: book.id, status: book.status, progress: book.processingProgress, error: book.processingError ?? undefined }));

async function handleRequest(request: RpcRequest) {
  try {
    const schema = requestSchemas[request.operation];
    const payload = schema.parse(request.payload) as never;
    const result = await dispatch(request.operation, payload);
    const validated = responseSchemas[request.operation].parse(result);
    send({ id: request.id, ok: true, result: validated });
  } catch (error) {
    const secret = typeof request.payload === "object" && request.payload && "apiKey" in request.payload ? String((request.payload as { apiKey: unknown }).apiKey) : undefined;
    send({ id: request.id, ok: false, error: safeMessage(error, secret) });
  }
}

async function dispatch(operation: UtilityOperation, payload: never): Promise<unknown> {
  switch (operation) {
    case "library.list": return repository.listBooks();
    case "library.get": return repository.getBook((payload as { id: string }).id);
    case "library.import": return repository.importFile((payload as { path: string }).path, (book) => emit("import", { bookId: book.id, status: book.status, progress: book.processingProgress, error: book.processingError ?? undefined }));
    case "library.delete": return { deleted: repository.deleteBook((payload as { id: string }).id) };
    case "reader.getProgress": return repository.getProgress((payload as { bookId: string }).bookId);
    case "reader.saveProgress": return repository.saveProgress(payload);
    case "highlights.list": return repository.listHighlights((payload as { bookId: string }).bookId);
    case "highlights.create": return repository.createHighlight(payload);
    case "highlights.update": {
      const value = payload as { id: string; note?: string | null; color?: string };
      return repository.updateHighlight(value.id, value);
    }
    case "highlights.delete": return { deleted: repository.deleteHighlight((payload as { id: string }).id) };
    case "conversations.load": return repository.loadConversations((payload as { bookId: string }).bookId);
    case "conversations.save": return repository.saveConversation(payload);
    case "conversations.delete": return { deleted: repository.deleteConversation((payload as { id: string }).id) };
    case "notes.export": {
      const value = payload as { bookId: string; format: "markdown" | "json" };
      return repository.exportNotes(value.bookId, value.format);
    }
    case "credentials.test": return testCredential((payload as { apiKey: string }).apiKey);
    case "ai.start": {
      const value = payload as AiRequest & { requestId: string; apiKey: string };
      startAi(value);
      return { started: true };
    }
    case "ai.cancel": {
      const controller = activeRequests.get((payload as { requestId: string }).requestId);
      controller?.abort();
      return { cancelled: Boolean(controller) };
    }
  }
}

function startAi(request: AiRequest & { requestId: string; apiKey: string }) {
  const now = Date.now();
  while (startTimes.length && startTimes[0] < now - 60_000) startTimes.shift();
  if (startTimes.length >= 20) throw new Error("AI request limit reached. Please wait a moment.");
  if (activeRequests.size) throw new Error("Finish or cancel the current answer first.");
  startTimes.push(now);
  const controller = new AbortController();
  activeRequests.set(request.requestId, controller);
  void runAi(request, controller).finally(() => activeRequests.delete(request.requestId));
}

async function runAi(request: AiRequest & { requestId: string; apiKey: string }, controller: AbortController) {
  const startedAt = Date.now();
  try {
    emitAi({ requestId: request.requestId, type: "retrieval", status: "searching" });
    const results = request.scope === "selection" && request.selectedText ? [{
      text: request.selectedText,
      score: 1,
      citation: { sourceId: "S1", chunkId: `selection-${request.requestId}`, bookId: request.bookId, chapterTitle: "Selected passage", quote: request.selectedText.slice(0, 240), locator: request.currentLocator, startSpineIndex: request.currentSpineIndex, endSpineIndex: request.currentSpineIndex, startBlockIndex: request.currentBlockIndex, endBlockIndex: request.currentBlockIndex }
    }] : repository.search(request.bookId, request.question, request.scope, request.currentSpineIndex, request.currentBlockIndex);
    const citations = results.map((result) => result.citation);
    emitAi({ requestId: request.requestId, type: "retrieval", status: "ready", citations });
    if (!results.length) {
      const refusal = "I can’t support that from the permitted part of this book.";
      emitAi({ requestId: request.requestId, type: "text", delta: refusal });
      const threadId = persistAnswer(request, refusal, citations);
      emitAi({ requestId: request.requestId, type: "done", threadId });
      return;
    }
    const history = loadBoundedHistory(request);
    const prompt = [
      readerInstructions(request.action, request.scope),
      request.targetLanguage ? `Target language: ${request.targetLanguage}.` : "",
      history.length ? `Permitted conversation context:\n${history.map((item) => `${item.role}: ${item.text}`).join("\n")}` : "",
      `Question: ${request.question}`,
      "Permitted excerpts:",
      ...results.map((result) => `[${result.citation.sourceId}] ${result.citation.chapterTitle}\n${result.text}`)
    ].filter(Boolean).join("\n\n");
    let complete = "";
    await streamGemini(request.apiKey, prompt, controller.signal, (delta) => {
      complete += delta;
      emitAi({ requestId: request.requestId, type: "text", delta });
    });
    if (controller.signal.aborted) return;
    if (!complete.trim()) throw new Error("Gemini returned an empty response.");
    const threadId = persistAnswer(request, complete, citations);
    repository.db.prepare("INSERT INTO ai_usage (id, book_id, model, action, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), request.bookId, "gemini-2.5-flash", request.action, Date.now() - startedAt, new Date().toISOString());
    emitAi({ requestId: request.requestId, type: "done", threadId });
  } catch (error) {
    if (!controller.signal.aborted) emitAi({ requestId: request.requestId, type: "error", message: safeMessage(error, request.apiKey) });
  }
}

function loadBoundedHistory(request: AiRequest) {
  if (!request.threadId) return [];
  const thread = repository.loadConversations(request.bookId).find((item) => item.id === request.threadId);
  if (!thread) return [];
  const allowed = filterHistoryForScope(thread.messages.map((message) => ({ role: message.role, scope: message.scope, citations: message.citations })), request.scope, request.currentSpineIndex, request.currentBlockIndex);
  const allowedIds = new Set(allowed.map((item) => thread.messages.find((message) => message.role === item.role && message.scope === item.scope)?.id));
  return thread.messages.filter((message) => allowedIds.has(message.id)).slice(-8);
}

function persistAnswer(request: AiRequest, answer: string, citations: Conversation["messages"][number]["citations"]) {
  const now = new Date().toISOString();
  const threadId = request.threadId ?? randomUUID();
  const existing = repository.loadConversations(request.bookId).find((item) => item.id === threadId);
  repository.saveConversation({
    id: threadId, bookId: request.bookId, title: existing?.title ?? request.question.slice(0, 80), updatedAt: now,
    messages: [...(existing?.messages ?? []),
      { id: randomUUID(), role: "user", text: request.question, action: request.action, scope: request.scope, citations: [], createdAt: now },
      { id: randomUUID(), role: "assistant", text: answer, action: request.action, scope: request.scope, citations, createdAt: now }
    ]
  });
  return threadId;
}

async function streamGemini(apiKey: string, prompt: string, signal: AbortSignal, onText: (text: string) => void) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse", {
    method: "POST", signal,
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 900 } })
  });
  if (!response.ok || !response.body) throw new Error(`Gemini request failed (${response.status}).`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = JSON.parse(line.slice(6)) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
      if (text) onText(text);
    }
  }
}

async function testCredential(apiKey: string) {
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash", { headers: { "x-goog-api-key": apiKey } });
    return response.ok ? { valid: true, message: "Gemini connection verified." } : { valid: false, message: `Google rejected this key (${response.status}).` };
  } catch {
    return { valid: false, message: "Could not reach the Gemini service." };
  }
}

function emitAi(chunk: AiChunk) { emit("ai", chunk); }
function emit(channel: UtilityEvent["channel"], payload: unknown) { send({ type: "event", channel, payload }); }
function send(message: RpcResponse | UtilityEvent) { process.parentPort.postMessage(message); }
function safeMessage(error: unknown, secret?: string) {
  let message = error instanceof Error ? error.message : "The local service could not complete the request.";
  if (secret) message = message.replaceAll(secret, "[REDACTED]");
  return message.replace(/AIza[\w-]{20,}/g, "[REDACTED]").slice(0, 1_000);
}

process.once("exit", () => { clearInterval(keepAlive); repository.close(); });
