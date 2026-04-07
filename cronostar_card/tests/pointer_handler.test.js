// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.window.addEventListener) globalThis.window.addEventListener = vi.fn();
if (!globalThis.window.removeEventListener) globalThis.window.removeEventListener = vi.fn();
if (!globalThis.window.setTimeout) globalThis.window.setTimeout = setTimeout;
if (!globalThis.window.clearTimeout) globalThis.window.clearTimeout = clearTimeout;
if (!globalThis.document) {
  globalThis.document = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
} else {
  if (!globalThis.document.addEventListener) globalThis.document.addEventListener = vi.fn();
  if (!globalThis.document.removeEventListener) globalThis.document.removeEventListener = vi.fn();
}

import { PointerHandler } from "../src/handlers/pointer_handler.js";

vi.mock("../src/config.js", () => ({
  TIMEOUTS: { clickSuppression: 300 }
}));

vi.mock("../src/utils.js", () => ({
  Logger: { log: vi.fn(), warn: vi.fn() }
}));

describe("PointerHandler Coverage Boost", () => {
  let card;
  let handler;
  let addWindowListenerSpy;
  let removeWindowListenerSpy;
  let addDocumentListenerSpy;
  let removeDocumentListenerSpy;
  let selectionRect;
  let containerEl;

  beforeEach(() => {
    vi.useFakeTimers();
    addWindowListenerSpy = vi
      .spyOn(window, "addEventListener")
      .mockImplementation(() => {});
    removeWindowListenerSpy = vi
      .spyOn(window, "removeEventListener")
      .mockImplementation(() => {});
    addDocumentListenerSpy = vi
      .spyOn(document, "addEventListener")
      .mockImplementation(() => {});
    removeDocumentListenerSpy = vi
      .spyOn(document, "removeEventListener")
      .mockImplementation(() => {});

    selectionRect = { style: {} };
    containerEl = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 1000,
      }),
    };

    card = {
      stateManager: { alignSelectedPoints: vi.fn() },
      chartManager: {
        _updatePointStyles: vi.fn(),
        updatePointStyles: vi.fn(),
        deletePointAtEvent: vi.fn(),
        getChart: vi.fn(() => ({ scales: { x: { top: 100 }, y: { right: 50 } } })),
        getIndicesInArea: vi.fn(() => [1, 2]),
        update: vi.fn(),
      },
      selectionManager: {
        getSelectedPoints: vi.fn(() => []),
        selectIndices: vi.fn(),
        clearSelection: vi.fn(),
        logSelection: vi.fn(),
      },
      shadowRoot: {
        querySelector: vi.fn(() => containerEl),
        getElementById: vi.fn((id) => {
          if (id === "selection-rect") return selectionRect;
          return { style: {} };
        }),
      },
      requestUpdate: vi.fn(),
      isDragging: false,
      contextMenu: { show: false },
      pointerSelecting: false,
    };
    handler = new PointerHandler(card);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("onContextMenu handles Alt key", () => {
    const e = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      altKey: true,
      clientX: 100,
      clientY: 50,
    };
    handler.onContextMenu(e);
    expect(card.stateManager.alignSelectedPoints).toHaveBeenCalledWith("right");
  });

  it("onContextMenu deletes a single point when possible", () => {
    card.chartManager.deletePointAtEvent.mockReturnValue(true);
    handler.onContextMenu({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      altKey: false,
      clientX: 10,
      clientY: 20,
    });
    expect(card.chartManager.deletePointAtEvent).toHaveBeenCalled();
    expect(card.requestUpdate).not.toHaveBeenCalled();
  });

  it("onContextMenu opens menu for multiple selected points", () => {
    card.selectionManager.getSelectedPoints.mockReturnValue([0, 1]);
    handler.onContextMenu({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      altKey: false,
      clientX: 980,
      clientY: 980,
    });

    expect(card.contextMenu.show).toBe(true);
    expect(card.contextMenu.x).toBeGreaterThanOrEqual(5);
    expect(card.contextMenu.y).toBeGreaterThanOrEqual(5);

    vi.advanceTimersByTime(20);
    expect(addDocumentListenerSpy).toHaveBeenCalledWith(
      "click",
      expect.any(Function),
    );

    const closeHandler = addDocumentListenerSpy.mock.calls[0][1];
    closeHandler();
    expect(removeDocumentListenerSpy).toHaveBeenCalledWith("click", closeHandler);
  });

  it("showContextMenu falls back safely without container", () => {
    card.shadowRoot.querySelector.mockReturnValue(null);
    handler.showContextMenu(1, 2);
    expect(card.contextMenu).toEqual({ show: true, x: 5, y: 5 });
  });

  it("getContainerRelativeCoords falls back when container is missing", () => {
    card.shadowRoot.querySelector.mockReturnValue(null);
    expect(handler.getContainerRelativeCoords({ clientX: 3, clientY: 4 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("selection overlay helpers update styles", () => {
    handler.selStartPx = { x: 100, y: 80 };
    handler.selEndPx = { x: 120, y: 110 };

    handler.showSelectionOverlay();
    expect(selectionRect.style.display).toBe("block");
    expect(selectionRect.style.left).toBe("100px");
    expect(selectionRect.style.top).toBe("80px");

    handler.hideSelectionOverlay();
    expect(selectionRect.style.display).toBe("none");
  });

  it("updateSelectionOverlay ignores missing state", () => {
    handler.selStartPx = null;
    handler.selEndPx = null;
    handler.updateSelectionOverlay();
    expect(selectionRect.style.left).toBeUndefined();
  });

  it("onPointerDown ignores axis area", () => {
    const e = { pointerId: 1, clientX: 10, clientY: 10, ctrlKey: false };
    handler.onPointerDown(e);
    expect(handler.pendingSelectStart).toBeNull();
  });

  it("onPointerDown ignores while chart drag is active", () => {
    card.isDragging = true;
    handler.onPointerDown({ pointerId: 1, clientX: 100, clientY: 50 });
    expect(handler.pendingSelectStart).toBeNull();
  });

  it("onPointerDown handles long press", () => {
    const e = { pointerId: 1, clientX: 100, clientY: 50 };
    handler.onPointerDown(e);
    vi.advanceTimersByTime(600);
    expect(card.contextMenu.show).toBe(true);
  });

  it("onPointerMove captures pointer", () => {
    const target = { setPointerCapture: vi.fn() };
    handler.onPointerDown({ pointerId: 1, clientX: 100, clientY: 50, target });

    handler.onPointerMove({ pointerId: 1, clientX: 100, clientY: 60, target });
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);
    expect(handler.isSelecting).toBe(true);
    expect(card.pointerSelecting).toBe(true);
  });

  it("onPointerMove ignores unrelated pointer ids and prevents default while selecting", () => {
    const preventDefault = vi.fn();
    handler.activePointerId = 10;
    handler.onPointerMove({ pointerId: 11, clientX: 1, clientY: 1 });
    expect(preventDefault).not.toHaveBeenCalled();

    handler.isSelecting = true;
    handler.activePointerId = 10;
    handler.selStartPx = { x: 100, y: 50 };
    handler.selEndPx = { x: 100, y: 50 };
    handler.onPointerMove({
      pointerId: 10,
      clientX: 120,
      clientY: 80,
      cancelable: true,
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalled();
  });

  it("onPointerMove does not start selection while card is dragging", () => {
    handler.pendingSelectStart = { x: 100, y: 50 };
    handler.activePointerId = 1;
    card.isDragging = true;
    handler.onPointerMove({ pointerId: 1, clientX: 120, clientY: 70 });
    expect(handler.isSelecting).toBe(false);
  });

  it("onPointerUp handles additive selection (Shift key)", () => {
    card.selectionManager.getSelectedPoints.mockReturnValue([0]);
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };

    handler.onPointerDown({
      pointerId: 1,
      clientX: 100,
      clientY: 50,
      shiftKey: true,
      target,
    });
    handler.onPointerMove({ pointerId: 1, clientX: 100, clientY: 60, target });
    handler.onPointerUp({ pointerId: 1, clientX: 100, clientY: 60, target });

    expect(card.selectionManager.selectIndices).toHaveBeenCalledWith([0, 1, 2], true);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(card.chartManager.update).toHaveBeenCalled();
  });

  it("onPointerUp clears selection when no indices are found", () => {
    card.chartManager.getIndicesInArea.mockReturnValue([]);
    handler.isSelecting = true;
    handler.activePointerId = 1;
    handler.selStartPx = { x: 10, y: 10 };
    handler.selEndPx = { x: 20, y: 20 };

    handler.onPointerUp({ pointerId: 1, target: { releasePointerCapture: vi.fn() } });
    expect(card.selectionManager.clearSelection).toHaveBeenCalled();
  });

  it("onPointerUp handles click/no-selection path", () => {
    handler.activePointerId = 1;
    handler.pendingSelectStart = { x: 10, y: 10 };
    handler.onPointerUp({ pointerId: 1 });
    expect(handler.pendingSelectStart).toBeNull();
    expect(card.pointerSelecting).toBe(false);
  });

  it("onPointerUp ignores unrelated pointer ids", () => {
    handler.activePointerId = 3;
    handler.onPointerUp({ pointerId: 4 });
    expect(handler.activePointerId).toBe(3);
  });

  it("onPointerUp handles dragging state correctly", () => {
    card.isDragging = true;
    handler.activePointerId = 1;
    handler.onPointerUp({ pointerId: 1 });
    expect(card.pointerSelecting).toBe(false);
  });

  it("onPointerCancel resets active selection only", () => {
    handler.onPointerCancel();
    expect(card.pointerSelecting).toBe(false);

    handler.isSelecting = true;
    handler.activePointerId = 1;
    handler.pendingSelectStart = { x: 1, y: 1 };
    handler.onPointerCancel();
    expect(handler.isSelecting).toBe(false);
    expect(handler.activePointerId).toBeNull();
    expect(card.pointerSelecting).toBe(false);
  });

  it("handles errors in event handlers", () => {
    card.shadowRoot.querySelector.mockImplementation(() => {
      throw new Error("crash");
    });

    expect(() => handler.onPointerDown({ pointerId: 1 })).not.toThrow();
    expect(() => handler.onPointerMove({ pointerId: 1 })).not.toThrow();
    expect(() => handler.onPointerUp({ pointerId: 1 })).not.toThrow();
  });

  it("attach and detach listeners", () => {
    const canvas = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    handler.attachListeners(canvas);
    expect(canvas.addEventListener).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function),
      expect.any(Object),
    );
    expect(addWindowListenerSpy).toHaveBeenCalledWith(
      "pointermove",
      expect.any(Function),
      expect.any(Object),
    );

    handler.detachListeners(canvas);
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      "pointerdown",
      expect.any(Function),
      expect.any(Object),
    );
    expect(removeWindowListenerSpy).toHaveBeenCalledWith(
      "pointermove",
      expect.any(Function),
      expect.any(Object),
    );
  });
});
