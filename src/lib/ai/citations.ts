import type { Citation } from "./types";

export function validateCitationMarkers(text: string, sources: Citation[]) {
  const valid = new Set(sources.map((source) => source.sourceId));
  const invalid = new Set<string>();
  const cleanText = text.replace(/\[S(\d+)\]/g, (marker, number: string) => {
    const id = `S${number}`;
    if (valid.has(id)) return marker;
    invalid.add(id);
    return "";
  }).replace(/ {2,}/g, " ");
  return { text: cleanText, invalid: [...invalid] };
}
