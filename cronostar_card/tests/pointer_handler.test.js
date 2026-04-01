// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PointerHandler } from "../src/handlers/pointer_handler.js";

describe("PointerHandler", () => {
  let ph, card, stateManager, selectionManager, chartManager;

  beforeEach(() => {
    vi.useFakeTimers();

    stateManager = {
      alignSelectedPoints: vi.fn(),
    };

    selectionManager = {
      getSelectedPoints: vi.fn(() => []),
      selectIndices: vi.fn(),
      clearSelection: vi.fn(),
      logSelection: vi.fn(),
    };

    chartManager = {
      deletePointAtEvent: vi.fn(() => false),
      _updatePointStyles: vi.fn(),
      updatePointStyles: vi.fn(),
      update: vi.fn(),
      getChart: vi.fn(() => null),
      getIndicesInArea: vi.fn(() => [1, 2]),
    };

    const selectionRect = { style: {} };
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 300 }),
    };

    const shadowRoot = {
      querySelector: vi.fn((sel) => (sel === ".chart-container" ? container : null)),
      getElementById: vi.fn((id) => (id === "selection-rect" ? selectionRect : null)),
    };

    card = {
      stateManager,
      selectionManager,
      chartManager,
      shadowRoot,
      requestUpdate: vi.fn(),
      contextMenu: { show: false },
    };

    ph = new PointerHandler(card);
  });

  it("prevents default on context menu", () => {
    const event = { preventDefault: vi.fn(), clientX: 10, clientY: 10 };
    ph.onContextMenu(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("handles Alt + right click alignment", () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      altKey: true,
    };
    ph.onContextMenu(event);
    expect(stateManager.alignSelectedPoints).toHaveBeenCalledWith("right");
    expect(chartManager._updatePointStyles).toHaveBeenCalled();
  });

  it("tries fast delete on right click when one point is selected", () => {
    selectionManager.getSelectedPoints.mockReturnValue([1]);
    chartManager.deletePointAtEvent.mockReturnValue(true);

    const event = { preventDefault: vi.fn(), clientX: 10, clientY: 10 };
    ph.onContextMenu(event);

    expect(chartManager.deletePointAtEvent).toHaveBeenCalledWith(event);
    expect(card.contextMenu.show).toBeFalsy();
  });

  it("shows the context menu", () => {
    const event = { preventDefault: vi.fn(), clientX: 50, clientY: 50 };
    ph.onContextMenu(event);

    expect(card.contextMenu.show).toBe(true);
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("calculates relative container coordinates", () => {
    const event = { clientX: 100, clientY: 150 };
    expect(ph.getContainerRelativeCoords(event)).toEqual({ x: 100, y: 150 });
  });

  it("shows and hides selection overlay", () => {
    const rect = { style: {} };
    card.shadowRoot.getElementById.mockReturnValue(rect);

    ph.showSelectionOverlay();
    expect(rect.style.display).toBe("block");

    ph.hideSelectionOverlay();
    expect(rect.style.display).toBe("none");
  });

  it("ignores onPointerDown if card.isDragging is true", () => {
    card.isDragging = true;
    ph.onPointerDown({ clientX: 10, clientY: 10 });
    expect(ph.isSelecting).toBe(false);
  });

  it("starts pending selection on pointer down", () => {
    card.isDragging = false;
    const canvas = document.createElement("canvas");

    const event = {
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      button: 0,
      buttons: 1,
      isPrimary: true,
      target: canvas,
      currentTarget: canvas,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    ph.onPointerDown(event);

    expect(ph.pendingSelectStart).toEqual({ x: 10, y: 10 });
    expect(ph.activePointerId).toBe(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
