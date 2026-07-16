export type TextQuoteAnchor = { exact: string; prefix: string; suffix: string };

export type PublicationLocator =
  | {
      type: "epub";
      href: string;
      spineIndex: number;
      blockIndex?: number;
      progression?: number;
      cfi?: string;
      quote?: TextQuoteAnchor;
    }
  | {
      type: "pdf";
      page: number;
      rects?: Array<{ x: number; y: number; width: number; height: number }>;
      quote?: TextQuoteAnchor;
    };

export type ReaderSelection = { text: string; locator: PublicationLocator; rect: DOMRect };
export type TocItem = { id: string; href: string; label: string; subitems?: TocItem[] };

export interface PublicationRenderer {
  open(target: HTMLElement, sourceUrl: string): Promise<void>;
  destroy(): void;
  display(locator?: PublicationLocator | string): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  getLocator(): PublicationLocator | null;
  getToc(): TocItem[];
  applyStyles(styles: ReaderStyles): void;
  onRelocated(listener: (locator: PublicationLocator, percentage: number) => void): () => void;
  onSelection(listener: (selection: ReaderSelection) => void): () => void;
  onSurfaceInteraction(listener: () => void): () => void;
  clearSelection(): void;
}

export type ReaderStyles = {
  fontFamily: "serif" | "sans";
  fontSize: number;
  lineHeight: number;
  theme: "light" | "paper" | "dark";
};
