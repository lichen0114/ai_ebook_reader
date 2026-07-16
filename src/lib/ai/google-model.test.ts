import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReaderAction } from "./types";

const googleMocks = vi.hoisted(() => ({
  create: vi.fn(),
  provider: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: googleMocks.create }));

import { createGoogleChatModel, googleProviderOptionsForAction, thinkingLevelForAction } from "./google-model";

beforeEach(() => {
  googleMocks.create.mockReset();
  googleMocks.provider.mockReset();
  googleMocks.create.mockReturnValue(googleMocks.provider);
});

describe("Google chat model configuration", () => {
  it.each<ReaderAction>(["explain", "define", "translate", "example"])("uses minimal thinking for %s", (action) => {
    expect(thinkingLevelForAction(action)).toBe("minimal");
    expect(googleProviderOptionsForAction(action)).toEqual({
      google: { thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false } }
    });
  });

  it.each<ReaderAction>(["ask", "recap", "checkpoint-evaluate"])("uses low thinking for %s", (action) => {
    expect(thinkingLevelForAction(action)).toBe("low");
    expect(googleProviderOptionsForAction(action)).toEqual({
      google: { thinkingConfig: { thinkingLevel: "low", includeThoughts: false } }
    });
  });

  it("creates the configured provider-local model with the server key", () => {
    const model = { provider: "google.generative-ai", modelId: "gemini-3.1-flash-lite" };
    googleMocks.provider.mockReturnValue(model);

    expect(createGoogleChatModel({
      AI_CHAT_MODEL: "gemini-3.1-flash-lite",
      GOOGLE_GENERATIVE_AI_API_KEY: "google-secret"
    })).toBe(model);
    expect(googleMocks.create).toHaveBeenCalledWith({ apiKey: "google-secret" });
    expect(googleMocks.provider).toHaveBeenCalledWith("gemini-3.1-flash-lite");
  });
});
