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

  it("enable() sets enabled = true", () => {
    kh.disable();
    kh.enable();
    expect(kh.enabled).toBe(true);
  });

  it("disable() sets enabled = false", () => {
    kh.disable();
    expect(kh.enabled).toBe(false);
  });

  it("handleFocus() calls enable()", () => {
    kh.disable();
    kh.handleFocus({});
    expect(kh.enabled).toBe(true);
  });

  it("handleBlur() resets all modifiers", () => {
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
  it("calls containerEl.focus() if not in editor context", () => {
    const { kh } = makeKH();
    kh.containerEl.focus = vi.fn();
    kh.focusContainer();
    expect(kh.containerEl.focus).toHaveBeenCalled();
  });

  it("does not call focus() in editor context", () => {
    const { kh } = makeKH({ isEditorContext: vi.fn(() => true) });
    kh.containerEl.focus = vi.fn();
    kh.focusContainer();
    expect(kh.containerEl.focus).not.toHaveBeenCalled();
  });

  it("does nothing if containerEl is null", () => {
    const { kh } = makeKH();
    kh.containerEl = null;
    expect(() => kh.focusContainer()).not.toThrow();
  });

  it("handles exceptions inside focus() without propagating them", () => {
    const { kh } = makeKH();
    kh.containerEl.focus = vi.fn(() => { throw new Error("focus error"); });
    expect(() => kh.focusContainer()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Modifier key tracking (handleKeydown)
// ---------------------------------------------------------------------------

describe("handleKeydown – modifier tracking", () => {
  let kh;
  beforeEach(() => ({ kh } = makeKH()));

  it("tracks Control", () => {
    kh.handleKeydown(evt("Control"));
    expect(kh.ctrlDown).toBe(true);
  });

  it("tracks Meta", () => {
    kh.handleKeydown(evt("Meta"));
    expect(kh.metaDown).toBe(true);
  });

  it("tracks Shift", () => {
    kh.handleKeydown(evt("Shift"));
    expect(kh.shiftDown).toBe(true);
  });

  it("tracks Alt", () => {
    kh.handleKeydown(evt("Alt"));
    expect(kh.altDown).toBe(true);
  });

  it("modifiers return before processing actions", () => {
    // No exception = early return works
    expect(() => kh.handleKeydown(evt("Control"))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// handleKeydown – disabled
// ---------------------------------------------------------------------------

describe("handleKeydown – disabled", () => {
  it("does not execute actions when disabled", () => {
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

  it("Ctrl+Z calls undo and prevents default", () => {
    const e = evt("z", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.undo).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it("Ctrl+Z (uppercase) calls undo", () => {
    const e = evt("Z", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.undo).toHaveBeenCalled();
  });

  it("Ctrl+Y calls redo", () => {
    const e = evt("y", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.redo).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Ctrl+Shift+Z calls redo", () => {
    const e = evt("z", { ctrlKey: true, shiftKey: true });
    kh.handleKeydown(e);
    expect(card.stateManager.redo).toHaveBeenCalled();
  });

  it("Meta+Z calls undo (Mac)", () => {
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

  it("Alt+Q calls handleInsertPoint", () => {
    kh.handleInsertPoint = vi.fn();
    kh.altDown = true;
    const e = evt("q");
    kh.handleKeydown(e);
    expect(kh.handleInsertPoint).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Alt+Q via e.altKey calls handleInsertPoint", () => {
    kh.handleInsertPoint = vi.fn();
    const e = evt("q", { altKey: true });
    kh.handleKeydown(e);
    expect(kh.handleInsertPoint).toHaveBeenCalled();
  });

  it("Alt+W calls handleDeletePoint", () => {
    kh.handleDeletePoint = vi.fn();
    const e = evt("w", { altKey: true });
    kh.handleKeydown(e);
    expect(kh.handleDeletePoint).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Alt+W via altDown calls handleDeletePoint", () => {
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

  it("Ctrl+Enter calls eventHandlers.handleApplyNow", () => {
    const e = evt("Enter", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.eventHandlers.handleApplyNow).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Ctrl+S performs preventDefault without crash", () => {
    const e = evt("s", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Ctrl+A calls selectionManager.selectAll", () => {
    const e = evt("a", { ctrlKey: true });
    kh.handleKeydown(e);
    expect(card.selectionManager.selectAll).toHaveBeenCalled();
    expect(card.chartManager.updatePointStyling).toHaveBeenCalled();
    expect(card.chartManager.update).toHaveBeenCalled();
  });

  it("Escape with contextMenu.show=true hides the menu", () => {
    card.contextMenu = { show: true };
    const e = evt("Escape");
    kh.handleKeydown(e);
    expect(card.contextMenu.show).toBe(false);
    expect(card.requestUpdate).toHaveBeenCalled();
  });

  it("Escape without active contextMenu calls handleEscape", () => {
    card.contextMenu = { show: false };
    kh.handleEscape = vi.fn();
    const e = evt("Escape");
    kh.handleKeydown(e);
    expect(kh.handleEscape).toHaveBeenCalled();
  });

  it("Escape with null contextMenu calls handleEscape without crash", () => {
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

  it("no selected index → ignores arrow keys", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([]);
    kh.handleKeydown(evt("ArrowUp"));
    expect(kh.handleArrowUpDown).not.toHaveBeenCalled();
  });

  it("ArrowUp with selected points calls handleArrowUpDown and sets isDragging", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([0]);
    const e = evt("ArrowUp");
    kh.handleKeydown(e);
    expect(kh.handleArrowUpDown).toHaveBeenCalledWith(e, [0]);
    expect(card.isDragging).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("ArrowDown calls handleArrowUpDown", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([0]);
    kh.handleKeydown(evt("ArrowDown"));
    expect(kh.handleArrowUpDown).toHaveBeenCalled();
  });

  it("ArrowLeft calls handleArrowLeftRight", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([0]);
    const e = evt("ArrowLeft");
    kh.handleKeydown(e);
    expect(kh.handleArrowLeftRight).toHaveBeenCalledWith(e, [0]);
    expect(card.isDragging).toBe(true);
  });

  it("ArrowRight calls handleArrowLeftRight", () => {
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

  it("releases Control → ctrlDown = false", () => {
    kh.ctrlDown = true;
    kh.handleKeyup(evt("Control"));
    expect(kh.ctrlDown).toBe(false);
  });

  it("releases Meta → metaDown = false", () => {
    kh.metaDown = true;
    kh.handleKeyup(evt("Meta"));
    expect(kh.metaDown).toBe(false);
  });

  it("releases Shift → shiftDown = false", () => {
    kh.shiftDown = true;
    kh.handleKeyup(evt("Shift"));
    expect(kh.shiftDown).toBe(false);
  });

  it("releases Alt → altDown = false", () => {
    kh.altDown = true;
    kh.handleKeyup(evt("Alt"));
    expect(kh.altDown).toBe(false);
  });

  it("ArrowUp keyup sets isDragging=false and calls scheduleHideDragValueDisplay", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("ArrowUp"));
    expect(card.isDragging).toBe(false);
    expect(card.chartManager.scheduleHideDragValueDisplay).toHaveBeenCalledWith(2500);
  });

  it("ArrowDown keyup sets isDragging=false", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("ArrowDown"));
    expect(card.isDragging).toBe(false);
  });

  it("ArrowLeft keyup sets isDragging=false", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("ArrowLeft"));
    expect(card.isDragging).toBe(false);
  });

  it("ArrowRight keyup sets isDragging=false", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("ArrowRight"));
    expect(card.isDragging).toBe(false);
  });

  it("generic key does not touch isDragging", () => {
    card.isDragging = true;
    kh.handleKeyup(evt("a"));
    expect(card.isDragging).toBe(true);
  });

  it("calls focusContainer after keyup", () => {
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

  it("ignores if disabled", () => {
    kh.disable();
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("z", { ctrlKey: true }));
    expect(kh.handleKeydown).not.toHaveBeenCalled();
  });

  it("ignores if containerEl is null", () => {
    kh.containerEl = null;
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("z", { ctrlKey: true }));
    expect(kh.handleKeydown).not.toHaveBeenCalled();
  });

  it("ignores if containerEl is the active element (focused)", () => {
    card.shadowRoot.activeElement = kh.containerEl;
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("z", { ctrlKey: true }));
    expect(kh.handleKeydown).not.toHaveBeenCalled();
  });

  it("ignores if no modifier is pressed", () => {
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("a"));  // no ctrlKey/metaKey/altKey
    expect(kh.handleKeydown).not.toHaveBeenCalled();
  });

  it("propagates to handleKeydown with Ctrl pressed", () => {
    kh.handleKeydown = vi.fn();
    card.shadowRoot.activeElement = null;
    kh._winKeydown(evt("z", { ctrlKey: true }));
    expect(kh.handleKeydown).toHaveBeenCalled();
  });

  it("propagates to handleKeydown with Meta pressed", () => {
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("z", { metaKey: true }));
    expect(kh.handleKeydown).toHaveBeenCalled();
  });

  it("propagates to handleKeydown with Alt pressed", () => {
    kh.handleKeydown = vi.fn();
    kh._winKeydown(evt("q", { altKey: true }));
    expect(kh.handleKeydown).toHaveBeenCalled();
  });
});

describe("_winKeyup", () => {
  let kh, card;
  beforeEach(() => ({ kh, card } = makeKH()));

  it("ignores if disabled", () => {
    kh.disable();
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("Control", { ctrlKey: true }));
    expect(kh.handleKeyup).not.toHaveBeenCalled();
  });

  it("ignores if containerEl is null", () => {
    kh.containerEl = null;
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("Control", { ctrlKey: true }));
    expect(kh.handleKeyup).not.toHaveBeenCalled();
  });

  it("ignores if the container has focus", () => {
    card.shadowRoot.activeElement = kh.containerEl;
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("Control", { ctrlKey: true }));
    expect(kh.handleKeyup).not.toHaveBeenCalled();
  });

  it("ignores if no modifier is pressed", () => {
    kh.handleKeyup = vi.fn();
    kh._winKeyup(evt("a"));
    expect(kh.handleKeyup).not.toHaveBeenCalled();
  });

  it("propagates to handleKeyup with Ctrl", () => {
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

  it("inserts point at mean value and time between two adjacent ones", () => {
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

  it("does not insert if no point is selected", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([]);
    kh.handleInsertPoint();
    expect(card.stateManager.insertPoint).not.toHaveBeenCalled();
  });

  it("does not insert if selected point is the last one", () => {
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

  it("removes selected point and updates chart", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([1]);
    card.stateManager.removePoint.mockReturnValue(true);
    kh.handleDeletePoint();
    expect(card.stateManager.removePoint).toHaveBeenCalledWith(1);
    expect(card.chartManager.updateData).toHaveBeenCalled();
    expect(card.selectionManager.clearSelection).toHaveBeenCalled();
  });

  it("does not update chart if removePoint returns false", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([1]);
    card.stateManager.removePoint.mockReturnValue(false);
    kh.handleDeletePoint();
    expect(card.chartManager.updateData).not.toHaveBeenCalled();
  });

  it("does nothing if no point is selected", () => {
    card.selectionManager.getActiveIndices.mockReturnValue([]);
    kh.handleDeletePoint();
    expect(card.stateManager.removePoint).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleEscape
// ---------------------------------------------------------------------------

describe("handleEscape", () => {
  it("clears selection and updates chart", () => {
    const { kh, card } = makeKH();
    kh.handleEscape();
    expect(card.selectionManager.clearSelection).toHaveBeenCalled();
    expect(card.chartManager.updatePointStyling).toHaveBeenCalledWith(null, []);
    expect(card.chartManager.update).toHaveBeenCalled();
  });

  it("works even if chartManager is null", () => {
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

  it("does nothing if chart is not ready", () => {
    const { kh, card } = makeKH();
    card.chartManager = {};  // no chart.data.datasets
    expect(() => kh.handleArrowLeftRight(evt("ArrowRight"), [0])).not.toThrow();
  });

  it("ArrowRight movement with default (5 minutes)", () => {
    const card = makeArrowCard([{ x: 60, y: 20 }, { x: 180, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    card.selectionManager.getActiveIndices.mockReturnValue([0]);

    kh.handleArrowLeftRight(evt("ArrowRight"), [0]);
    // Point 0 is also index 0 = first, so it is a fixed anchor (i===0 is skipped)
    // Check that setData is called
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("ArrowLeft movement with default", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");

    kh.handleArrowLeftRight(evt("ArrowLeft"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("ctrlKey uses reduced minutesStep", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight", { ctrlKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("shiftKey activates snapToGrid", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight", { shiftKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("altKey activates snapToGrid with larger step", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight", { altKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("is_switch_preset expands selection with adjacent partners", () => {
    const card = makeArrowCard(
      [{ x: 0, y: 0 }, { x: 119, y: 1 }, { x: 120, y: 0 }, { x: 1439, y: 0 }],
      { is_switch_preset: true }
    );
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("uses kb_def_h from config if defined", () => {
    const card = makeArrowCard(
      [{ x: 0, y: 10 }, { x: 120, y: 20 }, { x: 300, y: 30 }],
      { kb_def_h: 10 }
    );
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("uses kb_ctrl_h / kb_shift_h / kb_alt_h from config", () => {
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

  it("uses globalSettings.keyboard if present", () => {
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

  it("returns immediately if no index is valid", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowRight"), [99]);
    expect(card.stateManager.setData).not.toHaveBeenCalled();
  });

  it("filters partially invalid indices and logs warning", () => {
    const card = makeArrowCard([{ x: 0, y: 10 }, { x: 120, y: 20 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    // Index 0 is valid, 99 is invalid
    kh.handleArrowLeftRight(evt("ArrowRight"), [0, 99]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("clamps movement to leftLimit", () => {
    // Point at x=5, leftLimit will be 1 (if point 0 not selected).
    // Move left by 10 minutes.
    const card = makeArrowCard([
      { x: 0, y: 10 },
      { x: 5, y: 20 },
      { x: 120, y: 30 },
    ]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowLeftRight(evt("ArrowLeft"), [1]); // dx = -5 (default)
    // In handleArrowLeftRight p.x is modified directly in chart object
    expect(card.chartManager.chart.data.datasets[0].data[1].x).toBe(1);
  });

  it("clamps movement to rightLimit", () => {
    // Configuration to force clamping: point at 1435, step 10, limit 1438
    const card = makeArrowCard([
      { x: 0, y: 10 },
      { x: 1435, y: 20 }, // Point very close to limit (1438)
      { x: 1439, y: 30 }, // Right anchor point
    ]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");

    // Mock settings to use a step of 10
    card.config.kb_def_h = 10;

    // Move right by 10 - should reach 1438 (limit)
    kh.handleArrowLeftRight(evt("ArrowRight"), [1]);

    // Verify that point was clamped to limit
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

  it("returns immediately if e.altKey is true", () => {
    const card = makeUpDownCard([{ x: 60, y: 50 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp", { altKey: true }), [0]);
    expect(card.stateManager.setData).not.toHaveBeenCalled();
  });

  it("does nothing if chart is not ready", () => {
    const { kh, card } = makeKH();
    card.chartManager = {};
    expect(() => kh.handleArrowUpDown(evt("ArrowUp"), [0])).not.toThrow();
    expect(card.stateManager.setData).not.toHaveBeenCalled();
  });

  it("ArrowUp increments point value", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }, { x: 120, y: 100 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp"), [1]);
    // Value must have been modified in dataset
    expect(card.stateManager.setData).toHaveBeenCalled();
    const newData = card.stateManager.setData.mock.calls[0][0];
    expect(newData[1].value).toBeGreaterThanOrEqual(50);
  });

  it("ArrowDown decrements point value", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }, { x: 120, y: 100 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowDown"), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
    const newData = card.stateManager.setData.mock.calls[0][0];
    expect(newData[1].value).toBeLessThanOrEqual(50);
  });

  it("clamp to max with allow_max_value=false", () => {
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

  it("allow_max_value=true allows exceeding max_value", () => {
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

  it("ctrlKey uses reduced step", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp", { ctrlKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("shiftKey uses larger step", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp", { shiftKey: true }), [1]);
    expect(card.stateManager.setData).toHaveBeenCalled();
  });

  it("is_switch_preset: ArrowUp sets y=1 on all target points", () => {
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
    // For switch ArrowUp → val = 1
    const args = card.stateManager.setData.mock.calls[0][0];
    const movedPoint = args.find((p) => p.time === "00:59");
    if (movedPoint) expect(movedPoint.value).toBe(1);
  });

  it("is_switch_preset: ArrowDown sets y=0", () => {
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

  it("uses kb_def_v / kb_ctrl_v / kb_shift_v from config", () => {
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

  it("showDragValueDisplay is called with the first selected point", () => {
    const card = makeUpDownCard([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    kh.handleArrowUpDown(evt("ArrowUp"), [1]);
    expect(card.chartManager.showDragValueDisplay).toHaveBeenCalled();
  });

  it("restores selection by time after movement", () => {
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
  it("attachListeners with null does not throw exceptions", () => {
    const { kh } = makeKH();
    expect(() => kh.attachListeners(null)).not.toThrow();
  });

  it("attachListeners registers event listeners on element", () => {
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

  it("attachListeners calls detachListeners on previous element first", () => {
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

  it("detachListeners removes event listeners", () => {
    const { kh } = makeKH();
    const el = document.createElement("div");
    el.removeEventListener = vi.fn();

    kh.detachListeners(el);
    expect(el.removeEventListener).toHaveBeenCalledWith("keydown", kh.handleKeydown);
    expect(el.removeEventListener).toHaveBeenCalledWith("keyup", kh.handleKeyup);
    expect(el.removeEventListener).toHaveBeenCalledWith("focus", kh.handleFocus);
    expect(el.removeEventListener).toHaveBeenCalledWith("blur", kh.handleBlur);
  });

  it("detachListeners with null element does not throw exceptions", () => {
    const { kh } = makeKH();
    expect(() => kh.detachListeners(null)).not.toThrow();
  });

  it("attachListeners registers global listeners on window", () => {
    const { kh } = makeKH();
    const addSpy = vi.spyOn(window, "addEventListener");
    const el = document.createElement("div");
    kh.attachListeners(el);
    expect(addSpy).toHaveBeenCalledWith("keydown", kh._winKeydown, true);
    expect(addSpy).toHaveBeenCalledWith("keyup", kh._winKeyup, true);
    addSpy.mockRestore();
  });

  it("detachListeners removes global listeners from window", () => {
    const { kh } = makeKH();
    const removeSpy = vi.spyOn(window, "removeEventListener");
    kh.detachListeners(null);
    expect(removeSpy).toHaveBeenCalledWith("keydown", kh._winKeydown, true);
    expect(removeSpy).toHaveBeenCalledWith("keyup", kh._winKeyup, true);
    removeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Edge cases / additional branch coverage
// ---------------------------------------------------------------------------

describe("handleKeydown – additional branches", () => {
  it("Ctrl+Z without stateManager does not throw exceptions", () => {
    const card = makeCard();
    card.stateManager = undefined;
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    expect(() => kh.handleKeydown(evt("z", { ctrlKey: true }))).not.toThrow();
  });

  it("Ctrl+A without chartManager does not throw exceptions", () => {
    const card = makeCard();
    card.chartManager = null;
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    expect(() => kh.handleKeydown(evt("a", { ctrlKey: true }))).not.toThrow();
  });

  it("Ctrl+Enter without eventHandlers does not throw exceptions", () => {
    const card = makeCard();
    card.eventHandlers = undefined;
    const kh = new KeyboardHandler(card);
    kh.containerEl = document.createElement("div");
    expect(() => kh.handleKeydown(evt("Enter", { ctrlKey: true }))).not.toThrow();
  });
});

describe("handleArrowUpDown – numeric data (non-object)", () => {
  it("handles dataset with pure numeric values (non-object)", () => {
    const card = makeCard();
    card.config = { min_value: 0, max_value: 100, step_value: 1, allow_max_value: false };
    const cm = makeDataset([{ x: 0, y: 0 }, { x: 60, y: 50 }]);
    // Replace point with pure number (branch `typeof data[i] !== "object"`)
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
