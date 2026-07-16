import { describe, expect, it } from "vitest";
import { calculateSelectionToolbarPosition } from "./selection-toolbar";

describe("calculateSelectionToolbarPosition", () => {
  const toolbar = { width: 456, height: 54 };
  const viewport = { width: 480, height: 700 };

  it("clamps the toolbar to every viewport edge", () => {
    const topLeft = calculateSelectionToolbarPosition(rect(-80, 6, 30, 20), toolbar, viewport);
    const bottomRight = calculateSelectionToolbarPosition(rect(470, 680, 40, 18), toolbar, viewport);

    expect(topLeft.left).toBe(12);
    expect(topLeft.top).toBeGreaterThanOrEqual(12);
    expect(bottomRight.left + toolbar.width).toBeLessThanOrEqual(viewport.width - 12);
    expect(bottomRight.top + toolbar.height).toBeLessThanOrEqual(viewport.height - 12);
  });

  it("flips below a selection without room above", () => {
    const position = calculateSelectionToolbarPosition(rect(180, 28, 100, 22), toolbar, viewport);

    expect(position.placement).toBe("below");
    expect(position.top).toBe(60);
  });

  it("recalculates a valid position for the taller note editor", () => {
    const position = calculateSelectionToolbarPosition(rect(205, 340, 70, 24), { width: 456, height: 178 }, viewport);

    expect(position.placement).toBe("above");
    expect(position.left).toBeGreaterThanOrEqual(12);
    expect(position.top).toBeGreaterThanOrEqual(12);
    expect(position.top + 178).toBeLessThanOrEqual(viewport.height - 12);
  });
});

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, right: left + width, bottom: top + height, width };
}
