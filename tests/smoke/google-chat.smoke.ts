import { describe, expect, it, vi } from "vitest";
import { streamText } from "ai";

vi.mock("server-only", () => ({}));

import { createGoogleChatModel, googleProviderOptionsForAction } from "@/lib/ai/google-model";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

describe.skipIf(!apiKey)("credentialed Google chat", () => {
  it("streams a short answer cited to the supplied excerpt", async () => {
    const result = streamText({
      model: createGoogleChatModel({
        AI_CHAT_MODEL: process.env.AI_CHAT_MODEL || "gemini-3.1-flash-lite",
        GOOGLE_GENERATIVE_AI_API_KEY: apiKey
      }),
      providerOptions: googleProviderOptionsForAction("ask"),
      instructions: "Answer in one short sentence using only the permitted excerpt. End the supported claim with [S1].",
      prompt: "Permitted excerpt: [S1] Alice wondered what use a book was without pictures or conversations. What does Alice prefer?"
    });

    let answer = "";
    for await (const delta of result.textStream) answer += delta;

    expect(answer).toContain("[S1]");
    expect(answer.length).toBeGreaterThan(4);
  });
});
