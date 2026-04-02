// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  beforeEach(() => {
    vi.useFakeTimers();
    card = {
      stateManager: { alignSelectedPoints: vi.fn() },
      chartManager: { 
        _updatePointStyles: vi.fn(),
        updatePointStyles: vi.fn(),
        deletePointAtEvent: vi.fn(),
        getChart: vi.fn(() => ({ scales: { x: { top: 100 }, y: { right: 50 } } })),
        getIndicesInArea: vi.fn(() => [1, 2]),
        update: vi.fn()
      },
      selectionManager: { 
        getSelectedPoints: vi.fn(() => []),
        selectIndices: vi.fn(),
        clearSelection: vi.fn(),
        logSelection: vi.fn()
      },
      shadowRoot: {
        querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }) })),
        getElementById: vi.fn(() => ({ style: {} }))
      },
      requestUpdate: vi.fn(),
      isDragging: false,
      contextMenu: { show: false }
    };
    handler = new PointerHandler(card);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("onContextMenu handles Alt key", () => {
    const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), altKey: true };
    handler.onContextMenu(e);
    expect(card.stateManager.alignSelectedPoints).toHaveBeenCalledWith("right");
  });

  it("onPointerDown ignores axis area", () => {
    // Click on Y axis (x <= 50)
    const e = { pointerId: 1, clientX: 10, clientY: 10, ctrlKey: false };
    handler.onPointerDown(e);
    expect(handler.pendingSelectStart).toBeNull();
  });

  it("onPointerDown handles long press", () => {
    const e = { pointerId: 1, clientX: 100, clientY: 100 };
    handler.onPointerDown(e);
    vi.advanceTimersByTime(600);
    expect(card.contextMenu.show).toBe(true);
  });

  it("onPointerMove captures pointer", () => {
    const target = { setPointerCapture: vi.fn() };
    handler.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, target });
    
    // Move past threshold (6px) -> move 10px
    handler.onPointerMove({ pointerId: 1, clientX: 110, clientY: 110, target });
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);
    expect(handler.isSelecting).toBe(true);
  });

  it("onPointerUp handles additive selection (Shift key)", () => {
    card.selectionManager.getSelectedPoints.mockReturnValue([0]);
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    
    // Start selection
    handler.onPointerDown({ pointerId: 1, clientX: 100, clientY: 100, shiftKey: true, target });
    // Must move to start selection
    handler.onPointerMove({ pointerId: 1, clientX: 110, clientY: 110, target });
    
    // End selection
    handler.onPointerUp({ pointerId: 1, clientX: 110, clientY: 110, target });
    
    // Union of [0] and [1, 2]
    expect(card.selectionManager.selectIndices).toHaveBeenCalledWith([0, 1, 2], true);
  });

  it("onPointerUp handles dragging state correctly", () => {
    card.isDragging = true;
    handler.activePointerId = 1;
    handler.onPointerUp({ pointerId: 1 });
    expect(card.pointerSelecting).toBe(false);
  });

  it("handles errors in event handlers", () => {
    // Force error in getContainerRelativeCoords
    card.shadowRoot.querySelector.mockImplementation(() => { throw new Error("crash") });
    
    expect(() => handler.onPointerDown({ pointerId: 1 })).not.toThrow();
    expect(() => handler.onPointerMove({ pointerId: 1 })).not.toThrow();
    expect(() => handler.onPointerUp({ pointerId: 1 })).not.toThrow();
  });

  it("attach and detach listeners", () => {
    const canvas = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    handler.attachListeners(canvas);
    expect(canvas.addEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function), expect.any(Object));
    handler.detachListeners(canvas);
    expect(canvas.removeEventListener).toHaveBeenCalledWith("pointerdown", expect.any(Function), expect.any(Object));
  });
});
