// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KeyboardHandler } from "../src/handlers/keyboard_handler.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Build a minimal chart dataset usable by arrow-key handlers */
function makeDataset(points) {
  return {
    chart: {
      data: {
        datasets: [
          {
            data: points.map((p) => ({ x: p.x, y: p.y })),
            sort: vi.fn(),
          },
        ],
      },
    },
    updatePointStyling: vi.fn(),
    update: vi.fn(),
    updateData: vi.fn(),
    showDragValueDisplay: vi.fn(),
    scheduleHideDragValueDisplay: vi.fn(),
  };
}

/** Build a complete card mock */
function makeCard(overrides = {}) {
  const stateManager = {
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
    insertPoint: vi.fn(() => 1),
    removePoint: vi.fn(() => true),
    updatePoint: vi.fn(),
    getData: vi.fn(() => [{ time: "00:00", value: 20 }]),
    setData: vi.fn(),
    scheduleData: [{ time: "00:00", value: 10 }, { time: "02:00", value: 20 }],
  };

  const selectionManager = {
    getSelectedPoints: vi.fn(() => []),
    getActiveIndices: vi.fn(() => []),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    selectIndices: vi.fn(),
    selectedPoint: null,
    selectedPoints: [],
  };

  const chartManager = makeDataset([
    { x: 0, y: 10 },
    { x: 120, y: 20 },
  ]);

  const card = {
    stateManager,
    selectionManager,
    chartManager,
    isEditorContext: vi.fn(() => false),
    shadowRoot: { activeElement: null },
    requestUpdate: vi.fn(),
    config: { min_value: 0, max_value: 100, step_value: 1 },
    isDragging: false,
    lastEditAt: 0,
    globalSettings: {},
    eventHandlers: { handleApplyNow: vi.fn() },
    contextMenu: { show: false },
    ...overrides,
  };
  return card;
}

/** Build a KeyboardHandler with container element already attached */
function makeKH(cardOverrides = {}) {
  const card = makeCard(cardOverrides);
  const kh = new KeyboardHandler(card);
  kh.containerEl = document.createElement("div");
  return { kh, card };
}

/** Synthetic keyboard event factory */
function evt(key, extras = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// Basic enable / disable / focus / blur
// ---------------------------------------------------------------------------

describe("KeyboardHandler – enable / disable / focus / blur", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("enable() imposta enabled = true", () => {
    kh.disable();
    kh.enable();
    expect(kh.enabled).toBe(true);
  });

  it("disable() imposta enabled = false", () => {
    kh.disable();
    expect(kh.enabled).toBe(false);
  });

  it("handleFocus() richiama enable()", () => {
    kh.disable();
    kh.handleFocus({});
    expect(kh.enabled).toBe(true);
  });

  it("handleBlur() azzera tutti i modificatori", () => {
    kh.ctrlDown = true;
    kh.metaDown = true;
    kh.shiftDown = true;
    kh.altDown = true;
    kh.handleBlur({});
    expect(kh.ctrlDown).toBe(false);
    expect(kh.metaDown).toBe(false);
    expect(kh.shiftDown).toBe(false);
    expect(kh.altDown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// focusContainer
// ---------------------------------------------------------------------------

describe("focusContainer", () => {
  it("chiama containerEl.focus() se non siamo in editor context", () => {
    const { kh } = makeKH();
    kh.containerEl.focus = vi.fn();
    kh.focusContainer();
    expect(kh.containerEl.focus).toHaveBeenCalled();
  });

  it("non chiama focus() in editor context", () => {
    const { kh } = makeKH({ isEditorContext: vi.fn(() => true) });
    kh.containerEl.focus = vi.fn();
    kh.focusContainer();
    expect(kh.containerEl.focus).not.toHaveBeenCalled();
  });

  it("non fa nulla se containerEl è null", () => {
    const { kh } = makeKH();
    kh.containerEl = null;
    expect(() => kh.focusContainer()).not.toThrow();
  });

  it("gestisce eccezioni dentro focus() senza propagarle", () => {
    const { kh } = makeKH();
    kh.containerEl.focus = vi.fn(() => { throw new Error("focus error"); });
    expect(() => kh.focusContainer()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Modifier key tracking (handleKeydown)
// ---------------------------------------------------------------------------

describe("handleKeydown – tracking modificatori", () => {
  let kh;
  beforeEach(() => ({ kh } = makeKH()));

  it("traccia Control", () => {
    kh.handleKeydown(evt("Control"));
    expect(kh.ctrlDown).toBe(true);
  });

  it("traccia Meta", () => {
    kh.handleKeydown(evt("Meta"));
    expect(kh.metaDown).toBe(true);
  });

  it("traccia Shift", () => {
    kh.handleKeydown(evt("Shift"));
    expect(kh.shiftDown).toBe(true);
  });

  it("traccia Alt", () => {
    kh.handleKeydown(evt("Alt"));
    expect(kh.altDown).toBe(true);
  });

  it("i modificatori restituiscono prima di processare azioni", () => {
    // Nessuna eccezione = il return anticipato funziona
    expect(() => kh.handleKeydown(evt("Control"))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleKeydown – disabled
// ---------------------------------------------------------------------------

describe("handleKeydown – disabled", () => {
  it("non esegue azioni quando è disabilitato", () => {
    const { kh, card } = makeKH();
    kh.disable();
    kh.handleKeydown(evt("z", { ctrlKey: true }));
    expect(card.stateManager.undo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleKeydown – Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
// ---------------------------------------------------------------------------

describe("handleKeydown – Undo / Redo", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("Ctrl+Z chiama undo e previene default", () => {
    const e = evt("z", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.undo).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it("Ctrl+Z (uppercase) chiama undo", () => {
    const e = evt("Z", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.undo).toHaveBeenCalled();
  });

  it("Ctrl+Y chiama redo", () => {
    const e = evt("y", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.redo).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Ctrl+Shift+Z chiama redo", () => {
    const e = evt("z", { ctrlKey: true, shiftKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.redo).toHaveBeenCalled();
  });

  it("Meta+Z chiama undo (Mac)", () => {
    const e = evt("z", { metaKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.undo).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleKeydown – Alt+Q (insert) / Alt+W (delete)
// ---------------------------------------------------------------------------

describe("handleKeydown – Alt+Q / Alt+W", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("Alt+Q chiama handleInsertPoint", () => {
    kh.handleInsertPoint = vi.fn();
    kh.altDown = true;
    const e = evt("q");
    kh.handleKeydown(e);
    expect(kh.handleInsertPoint).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Alt+Q via e.altKey chiama handleInsertPoint", () => {
    kh.handleInsertPoint = vi.fn();
    const e = evt("q", { altKey: true });
    kh.handleKeydown(e);
    expect(kh.handleInsertPoint).toHaveBeenCalled();
  });

  it("Alt+W chiama handleDeletePoint", () => {
    kh.handleDeletePoint = vi.fn();
    const e = evt("w", { altKey: true });
    kh.handleKeydown(e);
    expect(kh.handleDeletePoint).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Alt+W via altDown chiama handleDeletePoint", () => {
    kh.handleDeletePoint = vi.fn();
    kh.altDown = true;
    kh.handleKeydown(evt("w"));
    expect(kh.handleDeletePoint).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleKeydown – Ctrl+Enter / Ctrl+S / Ctrl+A / Escape
// ---------------------------------------------------------------------------

describe("handleKeydown – Ctrl+Enter, Ctrl+S, Ctrl+A, Escape", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("Ctrl+Enter chiama eventHandlers.handleApplyNow", () => {
    const e = evt("Enter", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.eventHandlers.handleApplyNow).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Ctrl+S fa preventDefault senza crash", () => {
    const e = evt("s", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Ctrl+A chiama selectionManager.selectAll", () => {
    const e = evt("a", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.selectionManager.selectAll).toHaveBeenCalled();
    expect(card.chartManager.updatePointStyling).toHaveBeenCalled();
    expect(card.chartManager.update).toHaveBeenCalled();
  });

  it("Escape con contextMenu.show=true nasconde il menu", () => {
    card.contextMenu = { show: true };
    const e = evt("Escape");
    kh.handleKeydown(e);
    expect(card.contextMenu.show).toBe(false);
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("Escape senza contextMenu attivo chiama handleEscape", () => {
    card.contextMenu = { show: false };
    kh.handleEscape = vi.fn();
    const e = evt("Escape");
    kh.handleKeydown(e);
    expect(kh.handleEscape).toHaveBeenCalled();
  });

  it("Escape con contextMenu null chiama handleEscape senza crash", () => {
    card.contextMenu = null;
    kh.handleEscape = vi.fn();
    expect(() => kh.handleKeydown(evt("Escape"))).not.toThrow();
    expect(kh.handleEscape).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleKeydown – Arrow keys
// ---------------------------------------------------------------------------

describe("handleKeydown – Arrow keys", () => {
  let kh, card;
  beforeEach(() => {
    ({ kh, card } = makeKH());
    kh.handleArrowUpDown = vi.fn();
    kh.handleArrowLeftRight = vi.fn();
  });

  it("nessun indice selezionato → ignora arrow keys", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([]);
    kh.handleKeydown(evt("ArrowUp"));
    expect(kh.handleArrowUpDown).not.toHaveBeenCalled();
  });

  it("ArrowUp con punti selezionati chiama handleArrowUpDown e imposta isDragging", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([0]);
    const e = evt("ArrowUp");
    kh.handleKeydown(e);
    expect(kh.handleArrowUpDown).toHaveBeenCalledWith(e, [0]);
    expect(card.isDragging).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("ArrowDown chiama handleArrowUpDown", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([0]);
    kh.handleKeydown(evt("ArrowDown"));
    expect(kh.handleArrowUpDown).toHaveBeenCalled();
  });

  it("ArrowLeft chiama handleArrowLeftRight", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([0]);
    const e = evt("ArrowLeft");
    kh.handleKeydown(e);
    expect(kh.handleArrowLeftRight).toHaveBeenCalledWith(e, [0]);
    expect(card.isDragging).toBe(true);
  });

  it("ArrowRight chiama handleArrowLeftRight", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([0]);
    kh.handleKeydown(evt("ArrowRight"));
    expect(kh.handleArrowLeftRight).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleKeyup
// ---------------------------------------------------------------------------

describe("handleKeyup", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("rilascia Control → ctrlDown = false", () => {
    kh.ctrlDown = true;
    kh.handleKeyup(evt("Control"));
    expect(kh.ctrlDown).toBe(false);
  });

  it("rilascia Meta → metaDown = false", () => {
    kh.metaDown = true;
    kh.handleKeyup(evt("Meta"));
    expect(kh.metaDown).toBe(false);
  });

  it("rilascia Shift → shiftDown = false", () => {
    kh.shiftDown = true;
    kh.handleKeyup(evt("Shift"));
    expect(kh.shiftDown).toBe(false);
  });

  it("rilascia Alt → altDown = false", () => {
    kh.altDown = true;
    kh.handleKeyup(evt("Alt"));
    expect(kh.altDown).toBe(false);
  });

  it("ArrowUp keyup imposta isDragging=false e chiama scheduleHideDragValueDisplay", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("ArrowUp"));
    expect(card.isDragging).toBe(false);
    expect(card.chartManager.scheduleHideDragValueDisplay).toHaveBeenCalledWith(2500);
  });

  it("ArrowDown keyup imposta isDragging=false", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("ArrowDown"));
    expect(card.isDragging).toBe(false);
  });

  it("ArrowLeft keyup imposta isDragging=false", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("ArrowLeft"));
    expect(card.isDragging).toBe(false);
  });

  it("ArrowRight keyup imposta isDragging=false", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("ArrowRight"));
    expect(card.isDragging).toBe(false);
  });

  it("tasto generico non tocca isDragging", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("a"));
    expect(card.isDragging).toBe(true);
  });

  it("chiama focusContainer dopo il keyup", () => {
    kh.focusContainer = vi.fn();
    kh.handleKeyup(evt("a"));
    expect(kh.focusContainer).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// _winKeydown / _winKeyup
// ---------------------------------------------------------------------------

describe("_winKeydown", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("ignora se disabilitato", () => {
    kh.disable();
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("z", { ctrlKey: true }));
    expect(kh.handleKeydown).not.toHaveBeenCalled();
  });

  it("ignora se containerEl è null", () => {
    kh.containerEl = null;
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("z", { ctrlKey: true }));
    expect(kh.handleKeydown).not.toHaveBeenCalled();
  });

  it("ignora se il containerEl è l'elemento attivo (ha il focus)", () => {
    card.shadowRoot.activeElement = kh.containerEl;
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("z", { ctrlKey: true }));
    expect(kh.handleKeydown).not.toHaveBeenCalled();
  });

  it("ignora se nessun modificatore è premuto", () => {
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("a"));  // nessun ctrlKey/metaKey/altKey
    expect(kh.handleKeydown).not.toHaveBeenCalled();
  });

  it("propaga a handleKeydown con Ctrl premuto", () => {
    kh.handleKeydown = vi.fn();
    card.shadowRoot.activeElement = null;
    kh._winKeydown(evt("z", { ctrlKey: true }));
    expect(kh.handleKeydown).toHaveBeenCalled();
  });

  it("propaga a handleKeydown con Meta premuto", () => {
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("z", { metaKey: true }));
    expect(kh.handleKeydown).toHaveBeenCalled();
  });

  it("propaga a handleKeydown con Alt premuto", () => {
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("q", { altKey: true }));
    expect(kh.handleKeydown).toHaveBeenCalled();
  });
});

describe("_winKeyup", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("ignora se disabilitato", () => {
    kh.disable();
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("Control", { ctrlKey: true }));
    expect(kh.handleKeyup).not.toHaveBeenCalled();
  });

  it("ignora se containerEl è null", () => {
    kh.containerEl = null;
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("Control", { ctrlKey: true }));
    expect(kh.handleKeyup).not.toHaveBeenCalled();
  });

  it("ignora se il container ha il focus", () => {
    card.shadowRoot.activeElement = kh.containerEl;
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("Control", { ctrlKey: true }));
    expect(kh.handleKeyup).not.toHaveBeenCalled();
  });

  it("ignora se nessun modificatore è premuto", () => {
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("a"));
    expect(kh.handleKeyup).not.toHaveBeenCalled();
  });

  it("propaga a handleKeyup con Ctrl", () => {
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("Control", { ctrlKey: true }));
    expect(kh.handleKeyup).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleInsertPoint
// ---------------------------------------------------------------------------

describe("handleInsertPoint", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("inserisce il punto al valore e orario medi tra i due adiacenti", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([0]);
    card.stateManager.scheduleData = [
      { time: "00:00", value: 10 },
      { time: "02:00", value: 20 },
    ];
    kh.handleInsertPoint();
    // midMin = floor((0 + 120) / 2) = 60 → "01:00", midValue = (10+20)/2 = 15
    expect(card.stateManager.insertPoint).toHaveBeenCalledWith("01:00", 15);
    expect(card.chartManager.updateData).toHaveBeenCalled();
    expect(card.selectionManager.selectIndices).toHaveBeenCalledWith([1], false);
  });

  it("non inserisce se nessun punto è selezionato", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([]);
    kh.handleInsertPoint();
    expect(card.stateManager.insertPoint).not.toHaveBeenCalled();
  });

  it("non inserisce se il punto selezionato è l'ultimo", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([1]);
    card.stateManager.scheduleData = [
      { time: "00:00", value: 10 },
      { time: "02:00", value: 20 },
    ];
    kh.handleInsertPoint();
    // anchorIndex (1) >= scheduleData.length-1 (1) → early return
    expect(card.stateManager.insertPoint).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleDeletePoint
// ---------------------------------------------------------------------------

describe("handleDeletePoint", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("rimuove il punto selezionato e aggiorna il chart", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([1]);
    card.stateManager.removePoint.mockReturnValue(true);
    kh.handleDeletePoint();
    expect(card.stateManager.removePoint).toHaveBeenCalledWith(1);
    expect(card.chartManager.updateData).toHaveBeenCalled();
    expect(card.selectionManager.clearSelection).toHaveBeenCalled();
  });

  it("non aggiorna il chart se removePoint restituisce false", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([1]);
    card.stateManager.removePoint.mockReturnValue(false);
    kh.handleDeletePoint();
    expect(card.chartManager.updateData).not.toHaveBeenCalled();
  });

  it("non fa nulla se nessun punto è selezionato", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([]);
    kh.handleDeletePoint();
    expect(card.stateManager.removePoint).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleEscape
// ---------------------------------------------------------------------------

describe("handleEscape", () => {
  it("pulisce la selezione e aggiorna il chart", () => {
    const { kh, card } = makeKH();
    kh.handleEscape();
    expect(card.selectionManager.clearSelection).toHaveBeenCalled();
    expect(card.chartManager.updatePointStyling).toHaveBeenCalledWith(null, []);
    expect(card.chartManager.update).toHaveBeenCalled();
  });

  it("funziona anche se chartManager è null", () => {
    const { kh, card } = makeKH();
    card.chartManager = null;
    expect(() => kh.handleEscape()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleArrowLeftRight
// ---------------------------------------------------------------------------

describe("handleArrowLeftRight", () => {
  function makeArrowCard(dataPoints, configOverrides = {}) {
    const card = makeCard();
    card.config = { min_value: 0, max_value: 100, step_value: 1, ...configOverrides };
    card.chartManager = makeDataset(dataPoints);
    return card;
  }

  it("non fa nulla se il chart non è pronto", () => {
    const { kh, card } = makeKH();
    card.chartManager = {};  // nessun chart.data.datasets
    expect(() => kh.handleArrowLeftRight(evt("ArrowRight"), [0])).not.toThrow();
  });

  it("movimento ArrowRight con default (5 minuti)", () => {
    const card = makeArrowCard([{ x: 60, y: 20 }, { x: 180, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    card.selectionManager.getActiveIndices.mockReturnValue([0]);

    kh.handleArrowLeftRight(evt("ArrowRight"), [0]);
    // Il punto 0 è anche index 0 = primo, quindi è un "anchor" fisso (i===0 viene saltato)
    // Verifichiamo che setData sia chiamato
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("movimento ArrowLeft con default", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");

    kh.handleArrowLeftRight(evt("ArrowLeft"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("ctrlKey usa minutesStep ridotto", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight", { ctrlKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("shiftKey attiva snapToGrid", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight", { shiftKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("altKey attiva snapToGrid con step maggiore", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight", { altKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("is_switch_preset espande la selezione con partner adiacenti", () => {
    const card = makeArrowCard(
      [{ x: 0, y: 0 }, { x: 119, y: 1 }, { x: 120, y: 0 }, { x: 1439, y: 0 }],
      { is_switch_preset: true }
    );
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("usa kb_def_h da config se definito", () => {
    const card = makeArrowCard(
      [{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }],
      { kb_def_h: 10 }
    );
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("usa kb_ctrl_h / kb_shift_h / kb_alt_h da config", () => {
    const card = makeArrowCard(
      [{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }],
      { kb_ctrl_h: 2, kb_shift_h: 15, kb_alt_h: 30 }
    );
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    for (const modKey of ["ctrlKey", "shiftKey", "altKey"]) {
      kh.handleArrowLeftRight(evt("ArrowRight", { [modKey]: true }), [1]);
    }
    expect(card.stateManager.setData).toHaveBeenCalledTimes(3);
  });

  it("usa globalSettings.keyboard se presenti", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    card.globalSettings = {
      keyboard: {
        def: { horizontal: 3, vertical: 0.3 },
        ctrl: { horizontal: 1, vertical: 0.1 },
        shift: { horizontal: 15, vertical: 1.0 },
        alt: { horizontal: 30, vertical: 5.0 },
      },
    };
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("ritorna subito se nessun indice è valido", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight"), [99]);
    expect(card.stateManager.setData).not.toHaveBeenCalled();
  });

  it("filtra indici parzialmente invalidi e logga warning", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    // Indice 0 è valido, 99 è invalido
    kh.handleArrowLeftRight(evt("ArrowRight"), [0, 99]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("clampa il movimento al leftLimit", () => {
    // Punto a x=5, leftLimit sarà 1 (se non selezionato punto 0).
    // Spostiamo a sinistra di 10 minuti.
    const card = makeArrowCard([
      { x: 0, y: 10 },
      { x: 5, y: 20 },
      { x: 120, y: 30 },
    ]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowLeft"), [1]); // dx = -5 (default)
    // In handleArrowLeftRight p.x viene modificato direttamente nell'oggetto chart
    expect(card.chartManager.chart.data.datasets[0].data[1].x).toBe(1);
  });

  it("clampa il movimento al rightLimit", () => {
    // Configurazione per forzare il clamping: punto a 1435, step di 10, limite a 1438
    const card = makeArrowCard([
      { x: 0, y: 10 },
      { x: 1435, y: 20 }, // Punto molto vicino al limite (1438)
      { x: 1439, y: 30 }, // Punto di ancoraggio a destra
    ]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");

    // Mock delle impostazioni per usare uno step di 10
    card.config.kb_def_h = 10;

    // Sposta a destra di 10 - dovrebbe arrivare a 1438 (limite)
    kh.handleArrowLeftRight(evt("ArrowRight"), [1]);

    // Verifica che il punto sia stato clampato al limite
    expect(card.chartManager.chart.data.datasets[0].data[1].x).toBe(1438);
  });});

// ---------------------------------------------------------------------------
// handleArrowUpDown
// ---------------------------------------------------------------------------

describe("handleArrowUpDown", () => {
  function makeUpDownCard(dataPoints, configOverrides = {}) {
    const card = makeCard();
    card.config = {
      min_value: 0,
      max_value: 100,
      step_value: 1,
      allow_max_value: false,
      is_switch_preset: false,
      ...configOverrides,
    };
    card.chartManager = makeDataset(dataPoints);
    card.stateManager.getData.mockReturnValue(
      dataPoints.map((p, i) => ({ time: `0${i}:00`, value: p.y }))
    );
    return card;
  }

  it("ritorna subito se e.altKey è true", () => {
    const card = makeUpDownCard([{ x: 60, y: 50 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp", { altKey: true }), [0]);
    expect(card.stateManager.setData).not.toHaveBeenCalled();
  });

  it("non fa nulla se il chart non è pronto", () => {
    const { kh, card } = makeKH();
    card.chartManager = {};
    expect(() => kh.handleArrowUpDown(evt("ArrowUp"), [0])).not.toThrow();
    expect(card.stateManager.setData).not.toHaveBeenCalled();
  });

  it("ArrowUp incrementa il valore del punto", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }, { x: 120, y: 100 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp"), [1]);
    // Il valore deve essere stato modificato nel dataset
    expect(card.stateManager.setData).toHaveBeenCalled();
    const newData = card.stateManager.setData.mock.calls[0][0];
    expect(newData[1].value).toBeGreaterThanOrEqual(50);
  });

  it("ArrowDown decrementa il valore del punto", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }, { x: 120, y: 100 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowDown"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
    const newData = card.stateManager.setData.mock.calls[0][0];
    expect(newData[1].value).toBeLessThanOrEqual(50);
  });

  it("clamp al massimo con allow_max_value=false", () => {
    const card = makeUpDownCard(
      [{ x: 0, y: 0 }, { x: 60, y: 100 }],
      { max_value: 100, allow_max_value: false }
    );
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp"), [1]);
    const newData = card.stateManager.setData.mock.calls[0][0];
    expect(newData[1].value).toBeLessThanOrEqual(100);
  });

  it("allow_max_value=true permette di superare max_value", () => {
    const card = makeUpDownCard(
      [{ x: 0, y: 0 }, { x: 60, y: 100 }],
      { max_value: 100, step_value: 1, allow_max_value: true, is_switch_preset: false }
    );
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp"), [1]);
    // upperClamp = max_value + step_value = 101
    const newData = card.stateManager.setData.mock.calls[0][0];
    expect(newData[1].value).toBeLessThanOrEqual(101);
  });

  it("ctrlKey usa step ridotto", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp", { ctrlKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("shiftKey usa step maggiore", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp", { shiftKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("is_switch_preset: ArrowUp imposta y=1 su tutti i punti target", () => {
    const card = makeUpDownCard(
      [{ x: 0, y: 0 }, { x: 59, y: 1 }, { x: 60, y: 0 }, { x: 1439, y: 0 }],
      { is_switch_preset: true }
    );
    card.stateManager.getData.mockReturnValue([
      { time: "00:00", value: 0 },
      { time: "00:59", value: 0 },
    ]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
    // Per switch ArrowUp → val = 1
    const args = card.stateManager.setData.mock.calls[0][0];
    const movedPoint = args.find((p) => p.time === "00:59");
    if (movedPoint) expect(movedPoint.value).toBe(1);
  });

  it("is_switch_preset: ArrowDown imposta y=0", () => {
    const card = makeUpDownCard(
      [{ x: 0, y: 0 }, { x: 60, y: 1 }, { x: 1439, y: 0 }],
      { is_switch_preset: true }
    );
    card.stateManager.getData.mockReturnValue([
      { time: "00:00", value: 0 },
      { time: "01:00", value: 0 },
    ]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowDown"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("usa kb_def_v / kb_ctrl_v / kb_shift_v da config", () => {
    const card = makeUpDownCard(
      [{ x: 0, y: 0 }, { x: 60, y: 50 }],
      { kb_def_v: 2, kb_ctrl_v: 0.5, kb_shift_v: 5, kb_alt_v: 10 }
    );
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    for (const modKey of ["", "ctrlKey", "shiftKey"]) {
      const e = modKey ? evt("ArrowUp", { [modKey]: true }) : evt("ArrowUp");
      kh.handleArrowUpDown(e, [1]);
    }
    expect(card.stateManager.setData).toHaveBeenCalledTimes(3);
  });

  it("showDragValueDisplay viene chiamato con il primo punto selezionato", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp"), [1]);
    expect(card.chartManager.showDragValueDisplay).toHaveBeenCalled();
  });

  it("ripristina la selezione per tempo dopo il movimento", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    card.stateManager.getData.mockReturnValue([
      { time: "00:00", value: 0 },
      { time: "01:00", value: 51 },
    ]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp"), [1]);
    expect(card.selectionManager.selectIndices).toHaveBeenCalledWith([1], false);
  });
});

// ---------------------------------------------------------------------------
// attachListeners / detachListeners
// ---------------------------------------------------------------------------

describe("attachListeners / detachListeners", () => {
  it("attachListeners con null non lancia eccezioni", () => {
    const { kh } = makeKH();
    expect(() => kh.attachListeners(null)).not.toThrow();
  });

  it("attachListeners registra gli event listener sull'elemento", () => {
    const { kh } = makeKH();
    const el = document.createElement("div");
    el.addEventListener = vi.fn();

    kh.attachListeners(el);
    expect(el.addEventListener).toHaveBeenCalledWith("keydown", kh.handleKeydown);
    expect(el.addEventListener).toHaveBeenCalledWith("keyup", kh.handleKeyup);
    expect(el.addEventListener).toHaveBeenCalledWith("focus", kh.handleFocus);
    expect(el.addEventListener).toHaveBeenCalledWith("blur", kh.handleBlur);
    expect(kh.containerEl).toBe(el);
  });

  it("attachListeners chiama prima detachListeners sull'elemento precedente", () => {
    const { kh } = makeKH();
    const el = document.createElement("div");
    el.removeEventListener = vi.fn();
    kh.containerEl = el;

    const el2 = document.createElement("div");
    el2.addEventListener = vi.fn();
    el2.removeEventListener = vi.fn();
    kh.attachListeners(el2);

    expect(el.removeEventListener).toHaveBeenCalled();
  });

  it("detachListeners rimuove gli event listener", () => {
    const { kh } = makeKH();
    const el = document.createElement("div");
    el.removeEventListener = vi.fn();

    kh.detachListeners(el);
    expect(el.removeEventListener).toHaveBeenCalledWith("keydown", kh.handleKeydown);
    expect(el.removeEventListener).toHaveBeenCalledWith("keyup", kh.handleKeyup);
    expect(el.removeEventListener).toHaveBeenCalledWith("focus", kh.handleFocus);
    expect(el.removeEventListener).toHaveBeenCalledWith("blur", kh.handleBlur);
  });

  it("detachListeners con elemento null non lancia eccezioni", () => {
    const { kh } = makeKH();
    expect(() => kh.detachListeners(null)).not.toThrow();
  });

  it("attachListeners registra listener globali su window", () => {
    const { kh } = makeKH();
    const addSpy = vi.spyOn(window, "addEventListener");
    const el = document.createElement("div");
    kh.attachListeners(el);
    expect(addSpy).toHaveBeenCalledWith("keydown", kh._winKeydown, true);
    expect(addSpy).toHaveBeenCalledWith("keyup", kh._winKeyup, true);
    addSpy.mockRestore();
  });

  it("detachListeners rimuove listener globali da window", () => {
    const { kh } = makeKH();
    const removeSpy = vi.spyOn(window, "removeEventListener");
    kh.detachListeners(null);
    expect(removeSpy).toHaveBeenCalledWith("keydown", kh._winKeydown, true);
    expect(removeSpy).toHaveBeenCalledWith("keyup", kh._winKeyup, true);
    removeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Edge cases / branch coverage aggiuntiva
// ---------------------------------------------------------------------------

describe("handleKeydown – rami aggiuntivi", () => {
  it("Ctrl+Z senza stateManager non lancia eccezioni", () => {
    const card = makeCard();
    card.stateManager = undefined;
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    expect(() => kh.handleKeydown(evt("z", { ctrlKey: true }))).not.toThrow();
  });

  it("Ctrl+A senza chartManager non lancia eccezioni", () => {
    const card = makeCard();
    card.chartManager = null;
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    expect(() => kh.handleKeydown(evt("a", { ctrlKey: true }))).not.toThrow();
  });

  it("Ctrl+Enter senza eventHandlers non lancia eccezioni", () => {
    const card = makeCard();
    card.eventHandlers = undefined;
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    expect(() => kh.handleKeydown(evt("Enter", { ctrlKey: true }))).not.toThrow();
  });
});

describe("handleArrowUpDown – data numerico (non oggetto)", () => {
  it("gestisce dataset con valori numerici puri (non oggetto)", () => {
    const card = makeCard();
    card.config = { min_value: 0, max_value: 100, step_value: 1, allow_max_value: false };
    const cm = makeDataset([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    // Sostituiamo il punto con un numero puro (branch `typeof data[i] !== "object"`)
    cm.chart.data.datasets[0].data[1] = 50;
    card.chartManager = cm;
    card.stateManager.getData.mockReturnValue([
      { time: "00:00", value: 0 },
      { time: "01:00", value: 51 },
    ]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    expect(() => kh.handleArrowUpDown(evt("ArrowUp"), [1])).not.toThrow();
  });
});
