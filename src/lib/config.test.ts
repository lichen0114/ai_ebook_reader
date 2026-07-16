import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AI_CHAT_MODEL, EMBEDDING_DIMENSION, getConfig } from "./config";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("AI configuration", () => {
  it("defaults chat generation to the stable direct Google model", () => {
    delete process.env.AI_CHAT_MODEL;
    process.env.EMBEDDING_DIMENSION = String(EMBEDDING_DIMENSION);

    expect(getConfig().AI_CHAT_MODEL).toBe(DEFAULT_AI_CHAT_MODEL);
    expect(DEFAULT_AI_CHAT_MODEL).toBe("gemini-3.1-flash-lite");
  });

  it("accepts the server-side Google key without creating a public setting", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-secret";
    process.env.EMBEDDING_DIMENSION = String(EMBEDDING_DIMENSION);

    const config = getConfig();

    expect(config.GOOGLE_GENERATIVE_AI_API_KEY).toBe("google-secret");
    expect(Object.keys(config).some((key) => key.startsWith("NEXT_PUBLIC_"))).toBe(false);
    expect(config).not.toHaveProperty("AI_GATEWAY_API_KEY");
  });
});
