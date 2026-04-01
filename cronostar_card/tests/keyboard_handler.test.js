// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeyboardHandler } from "../src/handlers/keyboard_handler.js";

describe("KeyboardHandler", () => {
  let kh, card, stateManager, selectionManager;

  beforeEach(() => {
    stateManager = {
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      insertPoint: vi.fn(),
      removePoint: vi.fn(),
      updatePoint: vi.fn(),
      getData: vi.fn(() => [{ time: "00:00", value: 20 }]),
    };

    selectionManager = {
      getSelectedPoints: vi.fn(() => []),
      getActiveIndices: vi.fn(() => []),
      selectAll: vi.fn(),
      clearSelection: vi.fn(),
      selectIndices: vi.fn(),
    };

    card = {
      stateManager,
      selectionManager,
      chartManager: { 
        updatePointStyling: vi.fn(),
        update: vi.fn(),
        updateData: vi.fn(),
      },
      isEditorContext: vi.fn(() => false),
      shadowRoot: { activeElement: null },
      requestUpdate: vi.fn(),
      config: { min_value: 0, max_value: 100, step_value: 1 },
    };

    kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
  });

  it("dovrebbe gestire enable/disable", () => {
    kh.disable();
    expect(kh.enabled).toBe(false);
    kh.enable();
    expect(kh.enabled).toBe(true);
  });

  it("dovrebbe tracciare i tasti modificatori", () => {
    kh.handleKeydown({ key: "Control" });
    expect(kh.ctrlDown).toBe(true);
    kh.handleKeydown({ key: "Meta" });
    expect(kh.metaDown).toBe(true);
    kh.handleKeydown({ key: "Shift" });
    expect(kh.shiftDown).toBe(true);
    kh.handleKeydown({ key: "Alt" });
    expect(kh.altDown).toBe(true);
  });

  it("dovrebbe resettare i modificatori su blur", () => {
    kh.ctrlDown = true;
    kh.handleBlur();
    expect(kh.ctrlDown).toBe(false);
  });

  it("dovrebbe chiamare undo su Ctrl+Z", () => {
    const event = { 
      key: "z", 
      ctrlKey: true, 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn() 
    };
    kh.handleKeydown(event);
    expect(stateManager.undo).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("dovrebbe chiamare redo su Ctrl+Y", () => {
    const event = { 
      key: "y", 
      ctrlKey: true, 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn() 
    };
    kh.handleKeydown(event);
    expect(stateManager.redo).toHaveBeenCalled();
  });

  it("dovrebbe chiamare selectAll su Ctrl+A", () => {
    const event = { 
      key: "a", 
      ctrlKey: true, 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn() 
    };
    kh.handleKeydown(event);
    expect(selectionManager.selectAll).toHaveBeenCalled();
  });

  it("dovrebbe inserire un punto su Alt+Q", () => {
    kh.altDown = true;
    const event = { 
      key: "q", 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn() 
    };
    // Mock della logica interna di handleInsertPoint
    kh.handleInsertPoint = vi.fn();
    kh.handleKeydown(event);
    expect(kh.handleInsertPoint).toHaveBeenCalled();
  });

  it("dovrebbe cancellare la selezione su Escape", () => {
    const event = { 
      key: "Escape", 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn() 
    };
    kh.handleEscape = vi.fn();
    kh.handleKeydown(event);
    expect(kh.handleEscape).toHaveBeenCalled();
  });

  describe("handleInsertPoint", () => {
    it("dovrebbe inserire un punto tra due punti esistenti", () => {
      selectionManager.getActiveIndices.mockReturnValue([0]);
      stateManager.scheduleData = [
        { time: "00:00", value: 10 },
        { time: "02:00", value: 20 }
      ];
      card.chartManager = { 
        updateData: vi.fn(),
        updatePointStyling: vi.fn(),
      };
      kh.handleInsertPoint();
      expect(stateManager.insertPoint).toHaveBeenCalledWith("01:00", 15);
    });

    it("non dovrebbe inserire se nessun punto è selezionato", () => {
      selectionManager.getActiveIndices.mockReturnValue([]);
      kh.handleInsertPoint();
      expect(stateManager.insertPoint).not.toHaveBeenCalled();
    });
  });

  describe("handleDeletePoint", () => {
    it("dovrebbe rimuovere i punti selezionati", () => {
      selectionManager.getActiveIndices.mockReturnValue([1]);
      kh.handleDeletePoint();
      expect(stateManager.removePoint).toHaveBeenCalledWith(1);
    });
  });

  describe("Arrow keys", () => {
    beforeEach(() => {
      selectionManager.getActiveIndices.mockReturnValue([0]);
      stateManager.scheduleData = [{ time: "01:00", value: 50 }];
      kh.handleArrowUpDown = vi.fn();
      kh.handleArrowLeftRight = vi.fn();
    });

    it("gestisce ArrowUp", () => {
      const event = { key: "ArrowUp", preventDefault: vi.fn() };
      kh.handleKeydown(event);
      expect(kh.handleArrowUpDown).toHaveBeenCalled();
      expect(card.isDragging).toBe(true);
    });

    it("gestisce ArrowLeft", () => {
      const event = { key: "ArrowLeft", preventDefault: vi.fn() };
      kh.handleKeydown(event);
      expect(kh.handleArrowLeftRight).toHaveBeenCalled();
    });
  });

  describe("_winKeydown", () => {
    it("dovrebbe ignorare se disabilitato", () => {
      kh.disable();
      const spy = vi.spyOn(kh, "handleKeydown");
      kh._winKeydown({ ctrlKey: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it("dovrebbe chiamare handleKeydown se un modificatore è premuto e il container non è attivo", () => {
      kh.enable();
      const spy = vi.spyOn(kh, "handleKeydown").mockImplementation(() => {});
      card.shadowRoot.activeElement = null;
      kh._winKeydown({ ctrlKey: true, key: "z" });
      expect(spy).toHaveBeenCalled();
    });
  });
});
