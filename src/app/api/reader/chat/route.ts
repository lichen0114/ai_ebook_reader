import { createGateway } from "@ai-sdk/gateway";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText, toUIMessageStream, validateUIMessages } from "ai";
import { z } from "zod";
import { getSessionId } from "@/lib/auth/session";
import { demoCitations } from "@/lib/books/demo";
import { ownsBook, serverRepository } from "@/lib/books/server-repository";
import { getConfig } from "@/lib/config";
import { readerInstructions } from "@/lib/ai/instructions";
import type { Citation, ReaderUIMessage } from "@/lib/ai/types";
import { readerChatRequestSchema } from "@/lib/validation/reader-chat";

export const maxDuration = 30;

const metadataSchema = z.object({ action: z.enum(["ask", "explain", "define", "translate", "example", "recap", "checkpoint-evaluate"]).optional(), scope: z.enum(["selection", "current_chapter", "read_so_far", "whole_book"]).optional(), createdAt: z.string().optional() });
const dataSchemas = {
  retrieval: z.object({ status: z.enum(["searching", "reranking", "ready", "failed"]), candidateCount: z.number().optional() }),
  sources: z.object({ items: z.array(z.custom<Citation>()) }),
  scope: z.object({ value: z.enum(["selection", "current_chapter", "read_so_far", "whole_book"]), spoilerRisk: z.boolean() }),
  warning: z.object({ code: z.string(), message: z.string() })
};

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const parsed = readerChatRequestSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "The reader context was incomplete. Please try again from the passage." }, { status: 400 });
  const ownerId = await getSessionId();
  if (!ownsBook(ownerId, parsed.data.bookId)) return Response.json({ error: "Book not found." }, { status: 404 });
  if (!withinRateLimit(ownerId)) return Response.json({ error: "The intelligent margin needs a brief rest. Try again in a minute." }, { status: 429 });

  let messages: ReaderUIMessage[];
  try { messages = await validateUIMessages<ReaderUIMessage>({ messages: parsed.data.messages as ReaderUIMessage[], metadataSchema, dataSchemas }); }
  catch { return Response.json({ error: "The conversation history was invalid." }, { status: 400 }); }

  const citations = permittedSources(parsed.data);
  const config = getConfig();
  const stream = createUIMessageStream<ReaderUIMessage>({
    originalMessages: messages,
    execute: async ({ writer }) => {
      writer.write({ type: "data-retrieval", data: { status: "searching", candidateCount: citations.length }, transient: true });
      writer.write({ type: "data-scope", data: { value: parsed.data.scope, spoilerRisk: parsed.data.scope === "whole_book" } });
      writer.write({ type: "data-sources", data: { items: citations } });
      writer.write({ type: "data-retrieval", data: { status: "ready", candidateCount: citations.length } });

      if (parsed.data.bookId === "alice-in-wonderland" || !config.AI_GATEWAY_API_KEY || process.env.NODE_ENV === "test" || request.headers.get("x-margin-reader-demo") === "1") {
        await writeDeterministicAnswer(writer, deterministicAnswer(parsed.data, citations));
        return;
      }

      const gateway = createGateway({ apiKey: config.AI_GATEWAY_API_KEY });
      const evidence = citations.map((source) => `[${source.sourceId}] ${source.chapterTitle}\n${source.quote}`).join("\n\n");
      const result = streamText({
        model: gateway(config.AI_CHAT_MODEL),
        instructions: readerInstructions(parsed.data.action, parsed.data.scope),
        messages: [
          ...await convertToModelMessages(messages),
          { role: "user", content: `Permitted excerpts:\n${evidence || "No permitted excerpts were retrieved."}\n\nReader action: ${parsed.data.action}` }
        ],
        abortSignal: request.signal,
        timeout: { totalMs: 25_000 },
        onError: () => { /* Provider details are deliberately not logged. */ }
      });
      writer.merge(toUIMessageStream({ stream: result.stream, originalMessages: messages, sendStart: true, onError: () => "The AI provider could not complete this answer." }));
    },
    onError: () => "The intelligent margin could not answer, but the book remains available."
  });
  return createUIMessageStreamResponse({ stream });
}

type RequestData = z.infer<typeof readerChatRequestSchema>;
function permittedSources(data: RequestData): Citation[] {
  if (data.scope === "selection" && data.selectedText && data.selectionLocator) return [{ sourceId: "S1", chunkId: `selection-${Date.now()}`, bookId: data.bookId, chapterTitle: "Selected passage", quote: data.selectedText.slice(0, 340), locator: data.selectionLocator, startSpineIndex: data.currentSpineIndex, endSpineIndex: data.currentSpineIndex, startBlockIndex: Math.max(0, data.currentBlockIndex - 1), endBlockIndex: data.currentBlockIndex }];
  const allowed = demoCitations.filter((source) => data.scope === "whole_book" || data.scope === "current_chapter" ? source.startSpineIndex === data.currentSpineIndex : source.endSpineIndex < data.currentSpineIndex || (source.endSpineIndex === data.currentSpineIndex && source.endBlockIndex <= data.currentBlockIndex));
  if (data.scope === "whole_book" && /bill|chimney/i.test(lastText(data.messages))) allowed.push({ sourceId: `S${allowed.length + 1}`, chunkId: "alice-3-2", bookId: data.bookId, chapterTitle: "IV. The Rabbit Sends in a Little Bill", quote: "the little creature sent Bill down the chimney, and Alice gave one sharp kick", locator: { type: "epub", href: "text/chapter-4.xhtml", spineIndex: 3, blockIndex: 2, quote: { exact: "sent Bill down the chimney", prefix: "the little creature ", suffix: ", and Alice gave one sharp kick" } }, startSpineIndex: 3, endSpineIndex: 3, startBlockIndex: 2, endBlockIndex: 2 });
  return allowed.slice(0, 8).map((source, index) => ({ ...source, sourceId: `S${index + 1}` }));
}

function deterministicAnswer(data: RequestData, sources: Citation[]) {
  const query = lastText(data.messages);
  if (!sources.length || (data.scope !== "whole_book" && /bill|chimney|chapter four|later/i.test(query))) return "I can’t support that from the permitted part of this book.";
  const source = `[${sources[0].sourceId}]`;
  if (data.action === "define") return `In this passage, the selected phrase describes Alice’s immediate, practical judgment about whether an ordinary book can hold her attention. ${source} The meaning is tied to her preference for lively pictures and dialogue.`;
  if (data.action === "translate") return `這段話保留了愛麗絲帶點不耐、又充滿好奇的語氣：她心想，一本既沒有圖畫、也沒有對話的書，究竟有什麼用呢？ ${source}`;
  if (data.action === "example") return `A present-day example would be opening a dense manual, then wishing it showed the idea through a diagram or a conversation. That mirrors Alice’s desire for a book that feels immediate and alive. ${source}`;
  if (data.scope === "whole_book" && /bill|chimney/i.test(query)) return `Bill is sent down the chimney, and Alice responds with a sharp kick. ${source} This is directly stated in the later chapter.`;
  return `Alice is restless with passive reading and wants a book to feel vivid and conversational. ${source} Her thought establishes the curious, impatient attention that soon draws her after the White Rabbit.`;
}

async function writeDeterministicAnswer(writer: Parameters<Parameters<typeof createUIMessageStream<ReaderUIMessage>>[0]["execute"]>[0]["writer"], answer: string) {
  const id = crypto.randomUUID(); writer.write({ type: "text-start", id });
  const tokens = answer.match(/\S+\s*/g) ?? [answer];
  for (const token of tokens) { if (token) writer.write({ type: "text-delta", id, delta: token }); await new Promise((resolve) => setTimeout(resolve, 12)); }
  writer.write({ type: "text-end", id });
}
function lastText(messages: unknown[]) { const message = [...messages].reverse().find((item): item is { parts: Array<{ type: string; text?: string }> } => !!item && typeof item === "object" && "parts" in item && Array.isArray((item as { parts?: unknown }).parts)); return message?.parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join(" ") ?? ""; }
function withinRateLimit(ownerId: string) { const now = Date.now(); const recent = (serverRepository.rateLimits.get(ownerId) ?? []).filter((time) => time > now - 60_000); if (recent.length >= 20) return false; recent.push(now); serverRepository.rateLimits.set(ownerId, recent); return true; }
