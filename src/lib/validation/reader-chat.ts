import { z } from "zod";

const locatorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("epub"), href: z.string().max(1000), spineIndex: z.number().int().min(0), blockIndex: z.number().int().min(0).optional(), progression: z.number().min(0).max(1).optional(), cfi: z.string().max(2000).optional(), quote: z.object({ exact: z.string().max(20_000), prefix: z.string().max(500), suffix: z.string().max(500) }).optional() }),
  z.object({ type: z.literal("pdf"), page: z.number().int().positive(), rects: z.array(z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })).max(100).optional(), quote: z.object({ exact: z.string().max(20_000), prefix: z.string().max(500), suffix: z.string().max(500) }).optional() })
]);

export const actionSchema = z.enum(["ask", "explain", "define", "translate", "example", "recap", "checkpoint-evaluate"]);
export const scopeSchema = z.enum(["selection", "current_chapter", "read_so_far", "whole_book"]);

export const readerChatRequestSchema = z.object({
  messages: z.array(z.unknown()).max(50),
  bookId: z.string().min(1).max(100),
  action: actionSchema,
  scope: scopeSchema,
  currentLocator: locatorSchema,
  currentSpineIndex: z.number().int().min(0),
  currentBlockIndex: z.number().int().min(0),
  selectedText: z.string().max(20_000).optional(),
  selectionLocator: locatorSchema.optional(),
  targetLanguage: z.string().max(80).optional(),
  threadId: z.string().max(100).optional()
}).superRefine((value, context) => {
  if (value.scope === "selection" && !value.selectedText) context.addIssue({ code: "custom", path: ["selectedText"], message: "Selection scope requires selected text." });
});

export type ReaderChatRequest = z.infer<typeof readerChatRequestSchema>;
