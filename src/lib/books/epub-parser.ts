import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { parseHTML } from "linkedom";
import { createChunks, type BookBlockInput } from "./chunk";
import { isSafeArchivePath, sanitizeEpubHtml } from "./sanitize";

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true });
const MAX_ENTRIES = 2_000;
const MAX_EXPANDED = 200 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

type ManifestItem = { "@_id": string; "@_href": string; "@_media-type": string; "@_properties"?: string };

export type ParsedChapter = { title: string; href: string; spineIndex: number; blocks: BookBlockInput[]; chunks: ReturnType<typeof createChunks> };
export type ParsedEpub = { title: string; author: string; language: string; coverHref?: string; chapters: ParsedChapter[] };

function asArray<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function dirname(path: string) { return path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : ""; }
function resolve(base: string, relative: string) {
  const stack = (dirname(base) + relative).split("/");
  const output: string[] = [];
  for (const part of stack) { if (!part || part === ".") continue; if (part === "..") output.pop(); else output.push(part); }
  return output.join("/");
}

export async function parseEpub(buffer: ArrayBuffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const entries = Object.values(zip.files);
  if (!entries.length || entries.length > MAX_ENTRIES) throw new Error("Invalid EPUB archive entry count.");
  if (entries.some((entry) => !isSafeArchivePath(entry.name))) throw new Error("Unsafe EPUB archive path.");
  let expanded = 0;
  for (const entry of entries.filter((item) => !item.dir)) {
    const compression = (entry as unknown as { _data?: { compressedSize?: number; uncompressedSize?: number } })._data;
    if (compression?.compressedSize && compression.uncompressedSize && compression.uncompressedSize > 1024 * 1024 && compression.uncompressedSize / compression.compressedSize > MAX_COMPRESSION_RATIO) {
      throw new Error("EPUB contains a suspiciously compressed archive entry.");
    }
    const bytes = await entry.async("uint8array");
    expanded += bytes.byteLength;
    if (expanded > MAX_EXPANDED) throw new Error("EPUB expands beyond the safe limit.");
  }
  const containerText = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerText) throw new Error("EPUB container.xml is missing.");
  const container = xml.parse(containerText) as { container?: { rootfiles?: { rootfile?: { "@_full-path"?: string } } } };
  const opfPath = container.container?.rootfiles?.rootfile?.["@_full-path"];
  if (!opfPath || !isSafeArchivePath(opfPath)) throw new Error("EPUB package path is invalid.");
  const opfText = await zip.file(opfPath)?.async("text");
  if (!opfText) throw new Error("EPUB package file is missing.");
  const opf = xml.parse(opfText) as { package?: { metadata?: Record<string, unknown>; manifest?: { item?: ManifestItem | ManifestItem[] }; spine?: { itemref?: Array<{ "@_idref": string }> | { "@_idref": string } } } };
  const pkg = opf.package;
  if (!pkg) throw new Error("EPUB package is malformed.");
  const metadata = pkg.metadata ?? {};
  const value = (key: string, fallback: string) => {
    const raw = metadata[key];
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && "#text" in raw) return String((raw as { "#text": unknown })["#text"]);
    return fallback;
  };
  const manifest = new Map(asArray(pkg.manifest?.item).map((item) => [item["@_id"], item]));
  const chapters: ParsedChapter[] = [];
  for (const [spineIndex, ref] of asArray(pkg.spine?.itemref).entries()) {
    const item = manifest.get(ref["@_idref"]);
    if (!item || !/xhtml|html/.test(item["@_media-type"])) continue;
    const href = resolve(opfPath, item["@_href"]);
    const chapterHtml = await zip.file(href)?.async("text");
    if (!chapterHtml) continue;
    const safe = sanitizeEpubHtml(chapterHtml);
    const { document } = parseHTML(safe);
    const blocks: BookBlockInput[] = [];
    let headings: string[] = [];
    const nodes = document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,pre");
    nodes.forEach((node) => {
      const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!text) return;
      const tag = node.localName.toLowerCase();
      if (/h[1-6]/.test(tag)) {
        const level = Number(tag[1]);
        headings = [...headings.slice(0, level - 1), text];
      }
      blocks.push({ blockIndex: blocks.length, blockType: tag, text, headingPath: [...headings] });
    });
    chapters.push({ title: headings[0] ?? `Chapter ${spineIndex + 1}`, href, spineIndex, blocks, chunks: createChunks(blocks, 80, 400) });
  }
  if (!chapters.length) throw new Error("EPUB contains no readable chapters.");
  const cover = [...manifest.values()].find((item) => item["@_properties"]?.includes("cover-image"));
  return { title: value("title", "Untitled"), author: value("creator", "Unknown author"), language: value("language", "en"), coverHref: cover ? resolve(opfPath, cover["@_href"]) : undefined, chapters };
}
