import type Book from "epubjs/types/book";
import type Contents from "epubjs/types/contents";
import type Rendition from "epubjs/types/rendition";
import type { Location } from "epubjs/types/rendition";
import type { NavItem } from "epubjs/types/navigation";
import type { PublicationLocator, PublicationRenderer, ReaderSelection, ReaderStyles, TocItem } from "./publication-adapter";

export class EpubPublicationAdapter implements PublicationRenderer {
  private book: Book | null = null;
  private rendition: Rendition | null = null;
  private locator: PublicationLocator | null = null;
  private toc: TocItem[] = [];
  private relocationListeners = new Set<(locator: PublicationLocator, percentage: number) => void>();
  private selectionListeners = new Set<(selection: ReaderSelection) => void>();

  async open(target: HTMLElement, sourceUrl: string) {
    const { default: ePub } = await import("epubjs");
    this.book = ePub(sourceUrl);
    await this.book.opened;
    this.toc = (await this.book.loaded.navigation).toc.map(mapToc);
    this.rendition = this.book.renderTo(target, { width: "100%", height: "100%", flow: "paginated", spread: "none", allowScriptedContent: false });
    this.rendition.on("relocated", (location: Location) => {
      const spineIndex = location.start.index;
      this.locator = { type: "epub", href: location.start.href, spineIndex, progression: location.start.percentage, cfi: location.start.cfi, blockIndex: Math.max(0, Math.round(location.start.percentage * 20)) };
      this.relocationListeners.forEach((listener) => listener(this.locator!, location.start.percentage));
    });
    this.rendition.on("selected", (cfi: string, contents: Contents) => {
      const range = contents.range(cfi);
      const text = range.toString().replace(/\s+/g, " ").trim();
      if (!text) return;
      const raw = range.getBoundingClientRect();
      const frame = contents.window.frameElement?.getBoundingClientRect();
      const rect = new DOMRect((frame?.left ?? 0) + raw.left, (frame?.top ?? 0) + raw.top, raw.width, raw.height);
      const current = this.locator?.type === "epub" ? this.locator : { type: "epub" as const, href: "", spineIndex: contents.sectionIndex };
      const locator: PublicationLocator = { ...current, cfi, quote: { exact: text, prefix: "", suffix: "" } };
      this.selectionListeners.forEach((listener) => listener({ text, locator, rect }));
    });
    this.rendition.hooks.content.register((contents: Contents) => {
      contents.document.querySelectorAll("script,iframe,form,object,embed").forEach((node) => node.remove());
      contents.document.querySelectorAll("img[src],audio[src],video[src],source[src]").forEach((node) => {
        const source = node.getAttribute("src") ?? "";
        if (/^(?:https?:)?\/\//i.test(source)) node.remove();
      });
      contents.document.querySelectorAll("link[href]").forEach((node) => {
        const href = node.getAttribute("href") ?? "";
        if (/^(?:https?:)?\/\//i.test(href)) node.remove();
      });
      contents.document.querySelectorAll("a[href]").forEach((link) => {
        const href = link.getAttribute("href") ?? "";
        if (/^https?:/i.test(href)) { link.setAttribute("rel", "noreferrer noopener"); link.addEventListener("click", (event) => event.preventDefault()); }
      });
    });
  }

  async display(locator?: PublicationLocator | string) {
    if (!this.rendition) return;
    if (typeof locator === "string") await this.rendition.display(locator);
    else if (locator?.type === "epub") await this.rendition.display(locator.cfi ?? locator.href);
    else await this.rendition.display();
  }
  async next() { await this.rendition?.next(); }
  async previous() { await this.rendition?.prev(); }
  destroy() { this.rendition?.destroy(); this.book?.destroy(); this.rendition = null; this.book = null; }
  getLocator() { return this.locator; }
  getToc() { return this.toc; }
  onRelocated(listener: (locator: PublicationLocator, percentage: number) => void) { this.relocationListeners.add(listener); return () => this.relocationListeners.delete(listener); }
  onSelection(listener: (selection: ReaderSelection) => void) { this.selectionListeners.add(listener); return () => this.selectionListeners.delete(listener); }
  applyStyles(styles: ReaderStyles) {
    if (!this.rendition) return;
    const colors = styles.theme === "dark" ? { color: "#ded8cc", bg: "#20211f" } : styles.theme === "paper" ? { color: "#2b2925", bg: "#f6f0e4" } : { color: "#262522", bg: "#fbfaf7" };
    this.rendition.themes.default({
      body: { color: `${colors.color} !important`, background: `${colors.bg} !important`, "font-family": styles.fontFamily === "serif" ? '"Iowan Old Style", Palatino, Georgia, serif !important' : '"Avenir Next", sans-serif !important', "font-size": `${styles.fontSize}px !important`, "line-height": `${styles.lineHeight} !important`, padding: "0 2px !important" },
      p: { "margin-bottom": "1.15em !important" }, h1: { "font-weight": "500 !important", "letter-spacing": "-.02em !important" }, a: { color: `${colors.color} !important` }
    });
  }
  setFlow(mode: "paginated" | "scrolled-doc") { this.rendition?.flow(mode); }
  highlight(cfi: string, color = "rgba(220, 183, 94, .38)") { this.rendition?.annotations.highlight(cfi, {}, undefined, "margin-highlight", { fill: color, "fill-opacity": "0.45", "mix-blend-mode": "multiply" }); }
}

function mapToc(item: NavItem): TocItem { return { id: item.id, href: item.href, label: item.label.trim(), subitems: item.subitems?.map(mapToc) }; }
