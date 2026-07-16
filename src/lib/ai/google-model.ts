import "server-only";

import { createGoogleGenerativeAI, type GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { ReaderAction } from "@/lib/ai/types";
import type { AppConfig } from "@/lib/config";

export type GoogleThinkingLevel = "minimal" | "low";

export function thinkingLevelForAction(action: ReaderAction): GoogleThinkingLevel {
  switch (action) {
    case "explain":
    case "define":
    case "translate":
    case "example":
      return "minimal";
    case "ask":
    case "recap":
    case "checkpoint-evaluate":
      return "low";
  }
}

export function googleProviderOptionsForAction(action: ReaderAction): { google: GoogleGenerativeAIProviderOptions } {
  return {
    google: {
      thinkingConfig: {
        thinkingLevel: thinkingLevelForAction(action),
        includeThoughts: false
      }
    }
  };
}

export function createGoogleChatModel(config: Pick<AppConfig, "AI_CHAT_MODEL" | "GOOGLE_GENERATIVE_AI_API_KEY">) {
  const google = createGoogleGenerativeAI({ apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY });
  return google(config.AI_CHAT_MODEL);
}
