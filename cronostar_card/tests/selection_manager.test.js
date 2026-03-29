// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SelectionManager } from "../src/managers/selection_manager.js";
import { Events } from "../src/core/EventBus.js";

describe("SelectionManager", () => {
  let sm, ctx, stateManager;

  beforeEach(() => {
    stateManager = {
      getNumPoints: vi.fn(() => 10),
      getPointLabel: vi.fn((idx) => `Point ${idx}`),
    };

    ctx = {
      events: {
        on: vi.fn(),
        emit: vi.fn(),
      },
      getManager: vi.fn((name) => (name === "state" ? stateManager : null)),
      _card: {},
    };

    sm = new SelectionManager(ctx);
  });

  it("dovrebbe inizializzare con selezione vuota", () => {
    expect(sm.getSelectedPoints()).toEqual([]);
    expect(sm.getAnchor()).toBeNull();
  });

  it("dovrebbe selezionare un singolo punto con selectPoint()", () => {
    sm.selectPoint(5);
    expect(sm.getSelectedPoints()).toEqual([5]);
    expect(sm.getAnchor()).toBe(5);
    expect(ctx.events.emit).toHaveBeenCalledWith(Events.SELECTION_CHANGED, expect.any(Object));
  });

  it("dovrebbe gestire togglePoint() correttamente", () => {
    sm.togglePoint(3);
    expect(sm.isSelected(3)).toBe(true);
    expect(sm.getAnchor()).toBe(3);

    sm.togglePoint(3);
    expect(sm.isSelected(3)).toBe(false);
    expect(sm.getAnchor()).toBeNull();
  });

  it("dovrebbe cambiare l'ancora se il punto rimosso con toggle era l'ancora", () => {
    sm.selectIndices([1, 2]);
    sm.setAnchor(1);
    sm.togglePoint(1);
    expect(sm.getAnchor()).toBe(2);
  });

  it("dovrebbe selezionare un range con selectRange()", () => {
    sm.selectPoint(2);
    sm.selectRange(5);
    expect(sm.getSelectedPoints()).toEqual([2, 3, 4, 5]);
  });

  it("dovrebbe selezionare un range inverso con selectRange()", () => {
    sm.selectPoint(5);
    sm.selectRange(2);
    expect(sm.getSelectedPoints()).toEqual([2, 3, 4, 5]);
  });

  it("dovrebbe selezionare il punto se selectRange() viene chiamato senza ancora", () => {
    sm.selectRange(4);
    expect(sm.getSelectedPoints()).toEqual([4]);
  });

  it("dovrebbe selezionare indici specifici con selectIndices()", () => {
    sm.selectIndices([1, 3, 5]);
    expect(sm.getSelectedPoints()).toEqual([1, 3, 5]);
    expect(sm.getAnchor()).toBe(1);
  });

  it("dovrebbe preservare l'ancora in selectIndices() se richiesto", () => {
    sm.selectPoint(5);
    sm.selectIndices([5, 6, 7], true);
    expect(sm.getAnchor()).toBe(5);
  });

  it("dovrebbe selezionare tutto con selectAll()", () => {
    sm.selectAll();
    expect(sm.getSelectedPoints().length).toBe(10);
    expect(sm.getAnchor()).toBe(0);
  });

  it("dovrebbe pulire la selezione con clearSelection()", () => {
    sm.selectPoint(5);
    sm.clearSelection();
    expect(sm.getSelectedPoints()).toEqual([]);
    expect(sm.getAnchor()).toBeNull();
  });

  it("dovrebbe restituire gli indici attivi con getActiveIndices()", () => {
    expect(sm.getActiveIndices()).toEqual([]);
    
    sm.selectPoint(5);
    expect(sm.getActiveIndices()).toEqual([5]);
    
    sm.clearSelection();
    // Se non ci sono punti selezionati ma c'era un'ancora (teoricamente non possibile tramite API pubblica ma testiamo rami)
    sm._anchorPoint = 2;
    expect(sm.getActiveIndices()).toEqual([2]);
  });

  it("dovrebbe validare la selezione quando lo schedule cambia", () => {
    sm.selectPoint(8);
    stateManager.getNumPoints.mockReturnValue(5); // Ora max index è 4
    
    // Recupera il callback registrato su SCHEDULE_UPDATED
    const callback = ctx.events.on.mock.calls.find(c => c[0] === Events.SCHEDULE_UPDATED)[1];
    callback();
    
    expect(sm.isSelected(8)).toBe(false);
    expect(sm.getAnchor()).toBeNull();
  });

  it("dovrebbe gestire snapshot e restore", () => {
    sm.selectPoint(3);
    sm.snapshotSelection();
    sm.clearSelection();
    sm.restoreSelection();
    expect(sm.isSelected(3)).toBe(true);
  });

  it("non dovrebbe fare nulla se restoreSelection() viene chiamato senza snapshot", () => {
    sm.restoreSelection();
    expect(sm.getSelectedPoints()).toEqual([]);
  });

  it("dovrebbe gestire snapshot senza selezione", () => {
    sm.snapshotSelection();
    expect(sm._snapshot).toBeNull();
  });

  it("dovrebbe gestire delegazione eventi pointer", () => {
    ctx._card.pointerHandler = {
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
    };
    
    const event = { type: "pointerdown" };
    sm.handlePointerDown(event);
    expect(ctx._card.pointerHandler.onPointerDown).toHaveBeenCalledWith(event);
    
    sm.handlePointerMove(event);
    expect(ctx._card.pointerHandler.onPointerMove).toHaveBeenCalledWith(event);
    
    sm.handlePointerUp(event);
    expect(ctx._card.pointerHandler.onPointerUp).toHaveBeenCalledWith(event);
  });

  it("dovrebbe pulire le risorse con destroy()", () => {
    sm.selectPoint(1);
    sm.destroy();
    expect(sm.getSelectedPoints()).toEqual([]);
    expect(sm.getAnchor()).toBeNull();
  });
});
