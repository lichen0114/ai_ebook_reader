import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  convertToModelMessages: vi.fn(),
  createGoogle: vi.fn(),
  googleProvider: vi.fn(),
  streamText: vi.fn(),
  streamOptions: undefined as Record<string, unknown> | undefined,
  toUIMessageStream: vi.fn(),
  toUIOptions: undefined as Record<string, unknown> | undefined,
  uiOptions: undefined as Record<string, unknown> | undefined,
  events: [] as string[]
}));

vi.mock("server-only", () => ({}));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: mocks.createGoogle }));
vi.mock("@/lib/auth/session", () => ({ getSessionId: vi.fn(async () => "test-owner") }));
vi.mock("@/lib/books/server-repository", () => ({
  ownsBook: vi.fn(() => true),
  serverRepository: { rateLimits: new Map<string, number[]>() }
}));
vi.mock("ai", () => ({
  convertToModelMessages: mocks.convertToModelMessages,
  validateUIMessages: vi.fn(async ({ messages }: { messages: unknown[] }) => messages),
  streamText: mocks.streamText,
  toUIMessageStream: mocks.toUIMessageStream,
  createUIMessageStream: vi.fn((options: Record<string, unknown>) => {
    mocks.uiOptions = options;
    const execute = options.execute as (context: { writer: { write: (part: { type: string }) => void; merge: (stream: unknown) => void } }) => Promise<void>;
    return execute({
      writer: {
        write: (part) => { mocks.events.push(`write:${part.type}`); },
        merge: () => { mocks.events.push("merge"); }
      }
    });
  }),
  createUIMessageStreamResponse: vi.fn(async ({ stream }: { stream: Promise<void> }) => {
    await stream;
    return Response.json({ ok: true });
  })
}));

import { POST } from "./route";

const originalEnvironment = { ...process.env };

function chatRequest(action: "explain" | "ask" | "recap") {
  const controller = new AbortController();
  const request = new Request("http://localhost/api/reader/chat", {
    method: "POST",
    signal: controller.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "user-1", role: "user", parts: [{ type: "text", text: "What does this mean?" }] }],
      bookId: "alice-in-wonderland",
      action,
      scope: "selection",
      currentLocator: { type: "epub", href: "text/chapter-1.xhtml", spineIndex: 0, blockIndex: 1 },
      currentSpineIndex: 0,
      currentBlockIndex: 1,
      selectedText: "what is the use of a book, without pictures or conversations?",
      selectionLocator: { type: "epub", href: "text/chapter-1.xhtml", spineIndex: 0, blockIndex: 1 }
    })
  });
  return { controller, request };
}

beforeEach(() => {
  mocks.events.length = 0;
  mocks.streamOptions = undefined;
  mocks.toUIOptions = undefined;
  mocks.uiOptions = undefined;
  mocks.convertToModelMessages.mockReset().mockResolvedValue([{ role: "user", content: "prior message" }]);
  mocks.googleProvider.mockReset().mockImplementation((modelId: string) => ({ provider: "google.generative-ai", modelId }));
  mocks.createGoogle.mockReset().mockReturnValue(mocks.googleProvider);
  mocks.streamText.mockReset().mockImplementation((options: Record<string, unknown>) => {
    mocks.streamOptions = options;
    return { stream: { type: "mock-provider-stream" } };
  });
  mocks.toUIMessageStream.mockReset().mockImplementation((options: Record<string, unknown>) => {
    mocks.toUIOptions = options;
    return { type: "mock-ui-stream" };
  });
  vi.stubEnv("NODE_ENV", "development");
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-secret";
  delete process.env.AI_CHAT_MODEL;
  process.env.EMBEDDING_DIMENSION = "1536";
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnvironment };
});

describe("reader chat Google provider route", () => {
  it("streams the stable model after typed evidence with minimal thinking and the request abort signal", async () => {
    const { request } = chatRequest("explain");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createGoogle).toHaveBeenCalledWith({ apiKey: "google-secret" });
    expect(mocks.googleProvider).toHaveBeenCalledWith("gemini-3.1-flash-lite");
    expect(mocks.streamOptions).toMatchObject({
      model: { provider: "google.generative-ai", modelId: "gemini-3.1-flash-lite" },
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false } } },
      abortSignal: request.signal,
      timeout: { totalMs: 25_000 }
    });
    expect(mocks.events).toEqual([
      "write:data-retrieval",
      "write:data-scope",
      "write:data-sources",
      "write:data-retrieval",
      "merge"
    ]);

    const modelMessages = (mocks.streamOptions?.messages as Array<{ role: string; content: string }>);
    expect(modelMessages.at(-1)?.content).toContain("[S1] Selected passage");
    expect(modelMessages.at(-1)?.content).toContain("what is the use of a book");
  });

  it.each(["ask", "recap"] as const)("uses low thinking for %s", async (action) => {
    await POST(chatRequest(action).request);

    expect(mocks.streamOptions).toMatchObject({
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "low", includeThoughts: false } } }
    });
  });

  it("keeps the seeded book deterministic when the Google key is absent", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    await POST(chatRequest("explain").request);

    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.events.slice(0, 4)).toEqual([
      "write:data-retrieval",
      "write:data-scope",
      "write:data-sources",
      "write:data-retrieval"
    ]);
    expect(mocks.events).toContain("write:text-start");
    expect(mocks.events).toContain("write:text-end");
    expect(mocks.events).not.toContain("merge");
  });

  it("keeps provider failures generic and does not expose the provider error", async () => {
    await POST(chatRequest("ask").request);
    const providerError = new Error("secret provider body");

    expect(() => (mocks.streamOptions?.onError as (event: { error: Error }) => void)({ error: providerError })).not.toThrow();
    expect((mocks.toUIOptions?.onError as (error: Error) => string)(providerError)).toBe("The AI provider could not complete this answer.");
    expect((mocks.uiOptions?.onError as (error: Error) => string)(providerError)).toBe("The intelligent margin could not answer, but the book remains available.");
  });
});
