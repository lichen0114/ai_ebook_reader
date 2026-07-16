import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const locatorSchema = z.object({
  type: z.literal("epub"),
  href: z.string().max(1_000),
  spineIndex: z.number().int().min(0),
  blockIndex: z.number().int().min(0).optional(),
  progression: z.number().min(0).max(1).optional(),
  cfi: z.string().max(2_000).optional(),
  quote: z.object({
    exact: z.string().max(20_000),
    prefix: z.string().max(500),
    suffix: z.string().max(500)
  }).optional()
});

export type EpubLocator = z.infer<typeof locatorSchema>;

export const bookSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  author: z.string(),
  language: z.string(),
  description: z.string(),
  status: z.enum(["uploaded", "parsing", "chunking", "indexing", "ready", "failed"]),
  processingProgress: z.number().int().min(0).max(100),
  processingError: z.string().nullable(),
  progress: z.number().min(0).max(1),
  lastRead: z.string().nullable(),
  originalUrl: z.string(),
  chapters: z.array(z.object({
    id: uuidSchema,
    label: z.string(),
    href: z.string(),
    spineIndex: z.number().int().min(0)
  }))
});

export type LocalBook = z.infer<typeof bookSchema>;

export const progressSchema = z.object({
  bookId: uuidSchema,
  locator: locatorSchema,
  spineIndex: z.number().int().min(0),
  blockIndex: z.number().int().min(0),
  percentage: z.number().min(0).max(1),
  updatedAt: z.string(),
  settings: z.object({
    fontFamily: z.enum(["serif", "sans"]),
    fontSize: z.number().min(12).max(36),
    lineHeight: z.number().min(1).max(3),
    theme: z.enum(["light", "paper", "dark"]),
    width: z.number().min(400).max(1_200),
    mode: z.enum(["paginated", "scrolled-doc"])
  }).optional()
});

export type ReadingProgress = z.infer<typeof progressSchema>;

export const highlightSchema = z.object({
  id: uuidSchema,
  bookId: uuidSchema,
  exact: z.string().min(1).max(20_000),
  prefix: z.string().max(500),
  suffix: z.string().max(500),
  color: z.string().max(40),
  locator: locatorSchema,
  note: z.string().max(20_000).nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type Highlight = z.infer<typeof highlightSchema>;

export const citationSchema = z.object({
  sourceId: z.string().regex(/^S\d+$/),
  chunkId: z.string(),
  bookId: uuidSchema,
  chapterTitle: z.string(),
  quote: z.string(),
  locator: locatorSchema,
  startSpineIndex: z.number().int().min(0),
  endSpineIndex: z.number().int().min(0),
  startBlockIndex: z.number().int().min(0),
  endBlockIndex: z.number().int().min(0)
});

export type LocalCitation = z.infer<typeof citationSchema>;

export const aiRequestSchema = z.object({
  bookId: uuidSchema,
  threadId: uuidSchema.optional(),
  question: z.string().min(1).max(20_000),
  action: z.enum(["ask", "explain", "define", "translate", "example", "recap", "checkpoint-evaluate"]),
  scope: z.enum(["selection", "current_chapter", "read_so_far", "whole_book"]),
  currentLocator: locatorSchema,
  currentSpineIndex: z.number().int().min(0),
  currentBlockIndex: z.number().int().min(0),
  selectedText: z.string().max(20_000).optional(),
  targetLanguage: z.string().max(80).optional()
}).superRefine((value, context) => {
  if (value.scope === "selection" && !value.selectedText) {
    context.addIssue({ code: "custom", path: ["selectedText"], message: "Selection scope requires text." });
  }
});

export type AiRequest = z.infer<typeof aiRequestSchema>;

export const conversationSchema = z.object({
  id: uuidSchema,
  bookId: uuidSchema,
  title: z.string().max(300),
  messages: z.array(z.object({
    id: uuidSchema,
    role: z.enum(["user", "assistant"]),
    text: z.string().max(100_000),
    action: aiRequestSchema.shape.action.optional(),
    scope: aiRequestSchema.shape.scope.optional(),
    citations: z.array(citationSchema),
    createdAt: z.string()
  })).max(200),
  updatedAt: z.string()
});

export type Conversation = z.infer<typeof conversationSchema>;

export const credentialStatusSchema = z.object({
  configured: z.boolean(),
  encryptionAvailable: z.boolean()
});

export const credentialInputSchema = z.string().trim().min(20).max(500);
export const credentialTestResultSchema = z.object({ valid: z.boolean(), message: z.string().max(500) });

export const aiSettingsSchema = z.object({
  provider: z.enum(["gemini", "ollama"]),
  ollamaModel: z.string().trim().min(1).max(300).nullable()
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const ollamaModelSchema = z.object({
  name: z.string().min(1).max(300),
  size: z.number().nonnegative(),
  modifiedAt: z.string().max(100),
  parameterSize: z.string().max(100).nullable(),
  quantizationLevel: z.string().max(100).nullable()
});
export type OllamaModel = z.infer<typeof ollamaModelSchema>;

export const curatedOllamaModelSchema = z.object({
  model: z.string().min(1).max(300),
  label: z.string().min(1).max(100),
  approximateBytes: z.number().nonnegative(),
  memoryTier: z.enum(["compact", "balanced", "roomy"])
});
export type CuratedOllamaModel = z.infer<typeof curatedOllamaModelSchema>;

export const ollamaPullProgressSchema = z.object({
  requestId: uuidSchema,
  model: z.string().min(1).max(300),
  status: z.string().max(300),
  completedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative().nullable(),
  state: z.enum(["running", "success", "error", "cancelled"]),
  message: z.string().max(500).nullable()
});
export type OllamaPullProgress = z.infer<typeof ollamaPullProgressSchema>;

export const ollamaStatusSchema = z.object({
  available: z.boolean(),
  version: z.string().max(100).nullable(),
  models: z.array(ollamaModelSchema),
  recommendation: curatedOllamaModelSchema,
  memoryBytes: z.number().nonnegative(),
  activePull: z.object({ requestId: uuidSchema, model: z.string().min(1).max(300) }).nullable(),
  error: z.string().max(500).nullable()
});
export type OllamaStatus = z.infer<typeof ollamaStatusSchema>;

export const requestSchemas = {
  "library.list": z.object({}),
  "library.get": z.object({ id: uuidSchema }),
  "library.import": z.object({ path: z.string().min(1).max(16_000) }),
  "library.delete": z.object({ id: uuidSchema }),
  "reader.getProgress": z.object({ bookId: uuidSchema }),
  "reader.saveProgress": progressSchema.omit({ updatedAt: true }),
  "highlights.list": z.object({ bookId: uuidSchema }),
  "highlights.create": highlightSchema.omit({ createdAt: true, updatedAt: true }),
  "highlights.update": highlightSchema.pick({ id: true }).extend({ note: z.string().max(20_000).nullable().optional(), color: z.string().max(40).optional() }),
  "highlights.delete": z.object({ id: uuidSchema }),
  "conversations.load": z.object({ bookId: uuidSchema }),
  "conversations.save": conversationSchema,
  "conversations.delete": z.object({ id: uuidSchema }),
  "notes.export": z.object({ bookId: uuidSchema, format: z.enum(["markdown", "json"]) }),
  "credentials.test": z.object({ apiKey: z.string().min(1) }),
  "ai.settings.get": z.object({ hasGeminiKey: z.boolean() }),
  "ai.settings.save": aiSettingsSchema,
  "ollama.status": z.object({}),
  "ollama.pull.start": z.object({ model: z.enum(["qwen3.5:2b", "qwen3.5:4b", "qwen3.5:9b"]) }),
  "ollama.pull.cancel": z.object({ requestId: uuidSchema }),
  "ollama.delete": z.object({ model: z.string().min(1).max(300) }),
  "ai.start": aiRequestSchema.extend({ requestId: uuidSchema, provider: z.enum(["gemini", "ollama"]), model: z.string().min(1).max(300), apiKey: z.string().min(1).optional() }),
  "ai.cancel": z.object({ requestId: uuidSchema })
} as const;

export type UtilityOperation = keyof typeof requestSchemas;

export const responseSchemas = {
  "library.list": z.array(bookSchema),
  "library.get": bookSchema.nullable(),
  "library.import": bookSchema,
  "library.delete": z.object({ deleted: z.boolean() }),
  "reader.getProgress": progressSchema.nullable(),
  "reader.saveProgress": progressSchema,
  "highlights.list": z.array(highlightSchema),
  "highlights.create": highlightSchema,
  "highlights.update": highlightSchema,
  "highlights.delete": z.object({ deleted: z.boolean() }),
  "conversations.load": z.array(conversationSchema),
  "conversations.save": conversationSchema,
  "conversations.delete": z.object({ deleted: z.boolean() }),
  "notes.export": z.object({ content: z.string(), suggestedName: z.string() }),
  "credentials.test": z.object({ valid: z.boolean(), message: z.string() }),
  "ai.settings.get": aiSettingsSchema,
  "ai.settings.save": aiSettingsSchema,
  "ollama.status": ollamaStatusSchema,
  "ollama.pull.start": z.object({ requestId: uuidSchema }),
  "ollama.pull.cancel": z.object({ cancelled: z.boolean() }),
  "ollama.delete": z.object({ deleted: z.boolean(), settings: aiSettingsSchema }),
  "ai.start": z.object({ started: z.boolean() }),
  "ai.cancel": z.object({ cancelled: z.boolean() })
} as const;

export const aiChunkSchema = z.discriminatedUnion("type", [
  z.object({ requestId: uuidSchema, type: z.literal("retrieval"), status: z.enum(["searching", "ready"]), citations: z.array(citationSchema).optional() }),
  z.object({ requestId: uuidSchema, type: z.literal("text"), delta: z.string() }),
  z.object({ requestId: uuidSchema, type: z.literal("done"), threadId: uuidSchema }),
  z.object({ requestId: uuidSchema, type: z.literal("error"), message: z.string().max(1_000) })
]);
export type AiChunk = z.infer<typeof aiChunkSchema>;

export const importProgressSchema = z.object({
  bookId: uuidSchema,
  status: bookSchema.shape.status,
  progress: z.number().int().min(0).max(100),
  error: z.string().max(1_000).optional()
});
export type ImportProgress = z.infer<typeof importProgressSchema>;

export const updateStatusSchema = z.object({
  state: z.enum(["checking", "available", "not-available", "downloaded", "error"]),
  version: z.string().max(100).optional(),
  message: z.string().max(500).optional()
});
export type UpdateStatus = z.infer<typeof updateStatusSchema>;

export const appCommandSchema = z.enum(["import", "settings", "search"]);

export interface MarginReaderApi {
  library: {
    list(): Promise<LocalBook[]>;
    get(id: string): Promise<LocalBook | null>;
    importFile(file?: File): Promise<LocalBook | null>;
    delete(id: string): Promise<boolean>;
  };
  reader: {
    getProgress(bookId: string): Promise<ReadingProgress | null>;
    saveProgress(input: Omit<ReadingProgress, "updatedAt">): Promise<ReadingProgress>;
  };
  highlights: {
    list(bookId: string): Promise<Highlight[]>;
    create(input: Omit<Highlight, "createdAt" | "updatedAt">): Promise<Highlight>;
    update(id: string, input: { note?: string | null; color?: string }): Promise<Highlight>;
    delete(id: string): Promise<boolean>;
  };
  conversations: {
    load(bookId: string): Promise<Conversation[]>;
    save(conversation: Conversation): Promise<Conversation>;
    delete(id: string): Promise<boolean>;
  };
  notes: { export(bookId: string, format: "markdown" | "json"): Promise<boolean> };
  credentials: {
    status(): Promise<{ configured: boolean; encryptionAvailable: boolean }>;
    set(apiKey: string): Promise<void>;
    clear(): Promise<void>;
    test(): Promise<{ valid: boolean; message: string }>;
  };
  aiSettings: {
    get(): Promise<AiSettings>;
    save(settings: AiSettings): Promise<AiSettings>;
  };
  ollama: {
    status(): Promise<OllamaStatus>;
    startPull(model: "qwen3.5:2b" | "qwen3.5:4b" | "qwen3.5:9b"): Promise<string>;
    cancelPull(requestId: string): Promise<boolean>;
    deleteModel(model: string): Promise<AiSettings>;
    openDownloadPage(): Promise<void>;
    onPullProgress(callback: (progress: OllamaPullProgress) => void): () => void;
  };
  ai: {
    start(request: AiRequest): Promise<string>;
    cancel(requestId: string): Promise<void>;
    onChunk(callback: (chunk: AiChunk) => void): () => void;
  };
  imports: { onProgress(callback: (progress: ImportProgress) => void): () => void };
  updates: {
    check(): Promise<void>;
    install(): Promise<void>;
    onStatus(callback: (status: UpdateStatus) => void): () => void;
  };
  app: { onCommand(callback: (command: "import" | "settings" | "search") => void): () => void };
}

declare global {
  interface Window { marginReader: MarginReaderApi }
}
