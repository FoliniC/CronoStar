// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PointerHandler } from "../src/handlers/pointer_handler.js";

describe("PointerHandler", () => {
  let ph, card, stateManager, selectionManager, chartManager;

  beforeEach(() => {
    stateManager = {
      alignSelectedPoints: vi.fn(),
    };

    selectionManager = {
      getSelectedPoints: vi.fn(() => []),
      selectPoint: vi.fn(),
      clearSelection: vi.fn(),
    };

    chartManager = {
      deletePointAtEvent: vi.fn(() => false),
      _updatePointStyles: vi.fn(),
    };

    const shadowRoot = {
      querySelector: vi.fn((sel) => {
        if (sel === ".chart-container") {
          return {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 300 }),
          };
        }
        return null;
      }),
      getElementById: vi.fn((id) => {
        if (id === "selection-rect") {
          return { style: {} };
        }
        return null;
      }),
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

  it("dovrebbe prevenire il default su onContextMenu", () => {
    const event = { preventDefault: vi.fn(), clientX: 10, clientY: 10 };
    ph.onContextMenu(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("dovrebbe gestire l'allineamento con Alt + click destro", () => {
    const event = { 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn(), 
      altKey: true 
    };
    ph.onContextMenu(event);
    expect(stateManager.alignSelectedPoints).toHaveBeenCalledWith("right");
    expect(chartManager._updatePointStyles).toHaveBeenCalled();
  });

  it("dovrebbe tentare la cancellazione veloce su click destro se un solo punto è selezionato", () => {
    selectionManager.getSelectedPoints.mockReturnValue([1]);
    const event = { preventDefault: vi.fn(), clientX: 10, clientY: 10 };
    chartManager.deletePointAtEvent.mockReturnValue(true);
    
    ph.onContextMenu(event);
    expect(chartManager.deletePointAtEvent).toHaveBeenCalledWith(event);
    expect(card.contextMenu.show).toBeFalsy();
  });

  it("dovrebbe mostrare il menu contestuale", () => {
    const event = { preventDefault: vi.fn(), clientX: 50, clientY: 50 };
    ph.onContextMenu(event);
    expect(card.contextMenu.show).toBe(true);
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("dovrebbe calcolare le coordinate relative al container", () => {
    const event = { clientX: 100, clientY: 150 };
    const coords = ph.getContainerRelativeCoords(event);
    expect(coords).toEqual({ x: 100, y: 150 });
  });

  it("dovrebbe mostrare/nascondere l'overlay di selezione", () => {
    const rect = { style: {} };
    card.shadowRoot.getElementById.mockReturnValue(rect);
    
    ph.showSelectionOverlay();
    expect(rect.style.display).toBe("block");
    
    ph.hideSelectionOverlay();
    expect(rect.style.display).toBe("none");
  });

  it("dovrebbe ignorare onPointerDown se card.isDragging è true", () => {
    card.isDragging = true;
    const event = { clientX: 10, clientY: 10 };
    ph.onPointerDown(event);
    expect(ph.isSelecting).toBe(false);
  });

  it("dovrebbe iniziare la selezione su onPointerDown", () => {
    card.isDragging = false;
    const canvas = document.createElement("canvas");
    canvas.id = "myChart"; // L'handler spesso controlla l'ID o il tag
    
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
      stopPropagation: vi.fn()
    };
    ph.onPointerDown(event);
    expect(ph.pendingSelectStart).toEqual({ x: 10, y: 10 });
    expect(ph.activePointerId).toBe(1);
  });
});
