import type { PublicationLocator, TextQuoteAnchor } from "./publication-adapter";

export function serializeLocator(locator: PublicationLocator): string {
  return JSON.stringify(locator);
}

export function parseLocator(value: string): PublicationLocator | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    if (parsed.type === "epub" && "href" in parsed && "spineIndex" in parsed) return parsed as PublicationLocator;
    if (parsed.type === "pdf" && "page" in parsed) return parsed as PublicationLocator;
    return null;
  } catch {
    return null;
  }
}

export function createQuoteAnchor(text: string, start: number, end: number): TextQuoteAnchor {
  return { exact: text.slice(start, end), prefix: text.slice(Math.max(0, start - 48), start), suffix: text.slice(end, end + 48) };
}

export function findQuoteAnchor(text: string, anchor: TextQuoteAnchor): { start: number; end: number } | null {
  const matches: number[] = [];
  let cursor = 0;
  while ((cursor = text.indexOf(anchor.exact, cursor)) >= 0) {
    matches.push(cursor);
    cursor += Math.max(anchor.exact.length, 1);
  }
  if (!matches.length) return null;
  const score = (index: number) => {
    const before = text.slice(Math.max(0, index - anchor.prefix.length), index);
    const after = text.slice(index + anchor.exact.length, index + anchor.exact.length + anchor.suffix.length);
    return commonSuffix(before, anchor.prefix) + commonPrefix(after, anchor.suffix);
  };
  const start = matches.sort((a, b) => score(b) - score(a))[0];
  return { start, end: start + anchor.exact.length };
}

function commonPrefix(a: string, b: string) {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) count++;
  return count;
}

function commonSuffix(a: string, b: string) {
  return commonPrefix([...a].reverse().join(""), [...b].reverse().join(""));
}
