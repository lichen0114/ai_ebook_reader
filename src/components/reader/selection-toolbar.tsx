import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Highlighter, Languages, MessageSquareText, NotebookPen, Sparkles, TextCursorInput, X } from "lucide-react";
import type { ReaderAction } from "@/lib/ai/types";
import type { ReaderSelection } from "@/lib/reader/publication-adapter";

const VIEWPORT_MARGIN = 12;
const SELECTION_GAP = 10;

type ToolbarPlacement = "above" | "below";
export type ToolbarPosition = { left: number; top: number; pointerLeft: number; placement: ToolbarPlacement };

export function calculateSelectionToolbarPosition(
  selectionRect: Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width">,
  toolbarSize: { width: number; height: number },
  viewport: { width: number; height: number },
): ToolbarPosition {
  const maximumLeft = Math.max(VIEWPORT_MARGIN, viewport.width - toolbarSize.width - VIEWPORT_MARGIN);
  const idealLeft = selectionRect.left + selectionRect.width / 2 - toolbarSize.width / 2;
  const left = clamp(idealLeft, VIEWPORT_MARGIN, maximumLeft);
  const spaceAbove = selectionRect.top - VIEWPORT_MARGIN;
  const placement: ToolbarPlacement = spaceAbove >= toolbarSize.height + SELECTION_GAP ? "above" : "below";
  const idealTop = placement === "above"
    ? selectionRect.top - toolbarSize.height - SELECTION_GAP
    : selectionRect.bottom + SELECTION_GAP;
  const maximumTop = Math.max(VIEWPORT_MARGIN, viewport.height - toolbarSize.height - VIEWPORT_MARGIN);
  const top = clamp(idealTop, VIEWPORT_MARGIN, maximumTop);
  const pointerLeft = clamp(selectionRect.left + selectionRect.width / 2 - left, 18, Math.max(18, toolbarSize.width - 18));

  return { left, top, pointerLeft, placement };
}

type SelectionToolbarProps = {
  selection: ReaderSelection;
  noteMode: boolean;
  note: string;
  onNoteChange: (value: string) => void;
  onEnterNoteMode: () => void;
  onCancelNote: () => void;
  onClose: () => void;
  onHighlight: () => void;
  onSaveNote: () => void;
  onAction: (action: ReaderAction) => void;
};

const saveActions = [
  { label: "Highlight", icon: Highlighter, emphasis: true },
  { label: "Note", icon: NotebookPen, emphasis: false },
] as const;

const understandActions = [
  { label: "Explain", icon: Sparkles, action: "explain" },
  { label: "Define", icon: TextCursorInput, action: "define" },
  { label: "Translate", icon: Languages, action: "translate" },
  { label: "Ask", icon: MessageSquareText, action: "ask" },
] as const;

export function SelectionToolbar({ selection, noteMode, note, onNoteChange, onEnterNoteMode, onCancelNote, onClose, onHighlight, onSaveNote, onAction }: SelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ToolbarPosition>();

  const measureAndPlace = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const bounds = toolbar.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    setPosition(calculateSelectionToolbarPosition(selection.rect, bounds, { width: window.innerWidth, height: window.innerHeight }));
  }, [selection]);

  useLayoutEffect(() => {
    measureAndPlace();
    const toolbar = toolbarRef.current;
    const observer = toolbar && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureAndPlace) : undefined;
    if (toolbar) observer?.observe(toolbar);
    window.addEventListener("resize", measureAndPlace);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureAndPlace);
    };
  }, [measureAndPlace, noteMode]);

  const style = {
    left: position?.left ?? VIEWPORT_MARGIN,
    top: position?.top ?? VIEWPORT_MARGIN,
    visibility: position ? "visible" : "hidden",
    "--selection-pointer-left": `${position?.pointerLeft ?? 24}px`,
  } as CSSProperties;

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selected text actions"
      data-selection-toolbar
      data-placement={position?.placement ?? "above"}
      className="selection-command-bar fixed z-[70] flex w-[min(456px,calc(100vw-24px))] items-stretch overflow-visible rounded-[14px] border border-[#5b554b] bg-[#292824] text-[#f8f3e8] shadow-[0_18px_45px_rgba(28,24,18,.28),0_3px_10px_rgba(28,24,18,.2)]"
      style={style}
    >
      {!noteMode ? (
        <div className="flex min-w-0 flex-1 items-stretch p-1">
          <div role="group" aria-label="Save selection" className="flex min-w-0 flex-[2] items-stretch">
            {saveActions.map(({ label, icon: Icon, emphasis }) => (
              <button
                key={label}
                type="button"
                onClick={label === "Highlight" ? onHighlight : onEnterNoteMode}
                className={`selection-command flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[9px] px-1 text-[9px] font-semibold tracking-[.01em] transition-colors ${emphasis ? "text-[#e9c86f] hover:bg-[#e4bd5d]/14 hover:text-[#f2d98f]" : "text-[#eee8dc] hover:bg-white/9"}`}
              >
                <Icon aria-hidden="true" size={15} strokeWidth={1.8}/>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="my-2 mx-0.5 w-px shrink-0 bg-white/13"/>
          <div role="group" aria-label="Understand selection" className="flex min-w-0 flex-[4] items-stretch">
            {understandActions.map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={() => onAction(action)}
                className="selection-command flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[9px] px-0.5 text-[9px] font-medium text-[#eee8dc] transition-colors hover:bg-white/9 hover:text-white"
              >
                <Icon aria-hidden="true" size={15} strokeWidth={1.8}/>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="min-w-0 flex-1 p-2.5 pr-2">
          <label htmlFor="selection-note" className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[.14em] text-[#c9bfae]">Note on this passage</label>
          <textarea
            id="selection-note"
            autoFocus
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Add a thought…"
            rows={3}
            className="min-h-20 w-full resize-y rounded-[9px] border border-white/12 bg-[#1f1e1b] px-3 py-2 text-xs leading-relaxed text-[#fffaf0] outline-none placeholder:text-[#8f887c] focus:border-[#d4ae59] focus:ring-1 focus:ring-[#d4ae59]"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <button type="button" onClick={onCancelNote} className="min-h-10 rounded-lg px-3 text-xs font-medium text-[#d7d0c4] transition-colors hover:bg-white/9 hover:text-white">Cancel</button>
            <button type="button" onClick={onSaveNote} className="min-h-10 rounded-lg bg-[#e1bd69] px-3.5 text-xs font-semibold text-[#29251d] transition-colors hover:bg-[#edcc7c]">Save note</button>
          </div>
        </div>
      )}
      <div className="my-1 w-px shrink-0 bg-white/13"/>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close selected text actions"
        className="m-1 ml-0 grid size-10 shrink-0 place-items-center rounded-[9px] text-[#cfc7ba] transition-colors hover:bg-white/9 hover:text-white"
      >
        <X aria-hidden="true" size={16}/>
      </button>
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
