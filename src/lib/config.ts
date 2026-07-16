import { z } from "zod";

export const EMBEDDING_DIMENSION = 1536 as const;

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional().or(z.literal("")),
  AI_GATEWAY_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().min(1).default("openai/gpt-5.4-mini"),
  AI_EMBEDDING_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),
  AI_RERANK_MODEL: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(52_428_800),
  SESSION_SECRET: z.string().min(32).optional(),
  EMBEDDING_DIMENSION: z.coerce.number().int().default(EMBEDDING_DIMENSION),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).max(128).default(32)
});

export function getConfig() {
  const config = envSchema.parse(process.env);
  if (config.EMBEDDING_DIMENSION !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding dimension ${config.EMBEDDING_DIMENSION} does not match migration dimension ${EMBEDDING_DIMENSION}.`);
  }
  return config;
}
