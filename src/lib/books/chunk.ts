export type BookBlockInput = { blockIndex: number; blockType: string; text: string; headingPath: string[] };
export type StructuredChunk = { startBlockIndex: number; endBlockIndex: number; headingPath: string[]; text: string; tokenCount: number };

export function estimateTokens(text: string) { return Math.ceil(text.length / 4); }

export function createChunks(blocks: BookBlockInput[], minTokens = 300, maxTokens = 700): StructuredChunk[] {
  const usable = blocks.filter((block) => block.text.trim() && !["nav", "boilerplate"].includes(block.blockType));
  const chunks: StructuredChunk[] = [];
  let group: BookBlockInput[] = [];
  let tokens = 0;
  const flush = () => {
    if (!group.length) return;
    const text = group.map((block) => block.text.trim()).join("\n\n");
    chunks.push({ startBlockIndex: group[0].blockIndex, endBlockIndex: group[group.length - 1].blockIndex, headingPath: group[0].headingPath, text, tokenCount: estimateTokens(text) });
    group = [];
    tokens = 0;
  };
  for (const block of usable) {
    const blockTokens = estimateTokens(block.text);
    if (group.length && tokens + blockTokens > maxTokens) flush();
    group.push(block);
    tokens += blockTokens;
    if (tokens >= minTokens && /[.!?][”\"]?$/.test(block.text.trim())) flush();
  }
  flush();
  return chunks;
}
