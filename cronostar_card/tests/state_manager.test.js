// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock EventBus before importing StateManager
vi.mock("../src/core/EventBus.js", () => ({
  Events: {
    SCHEDULE_UPDATED: "SCHEDULE_UPDATED",
    PRESET_CHANGED: "PRESET_CHANGED",
    POINT_ADDED: "POINT_ADDED",
    POINT_UPDATED: "POINT_UPDATED",
    POINT_REMOVED: "POINT_REMOVED",
  },
}));

import { StateManager } from "../src/managers/state_manager.js";

// ─── Factory: creates a minimal context ───────────────────────────────────────
function makeContext(configOverrides = {}) {
  const listeners = {};
  const ctx = {
    config: {
      min_value: 15,
      max_value: 30,
      is_switch_preset: false,
      ...configOverrides,
    },
    hasUnsavedChanges: false,
    requestUpdate: vi.fn(),
    getManager: vi.fn(),
    events: {
      on: vi.fn((evt, fn) => { listeners[evt] = fn; }),
      emit: vi.fn(),
    },
    _listeners: listeners,
  };
  return ctx;
}

// ─── Constructor & Initialization ─────────────────────────────────────────
describe("StateManager – constructor and initialization", () => {
  it("creates boundary points 00:00 and 23:59", () => {
    const sm = new StateManager(makeContext());
    const d = sm.getData();
    expect(d[0].time).toBe("00:00");
    expect(d[d.length - 1].time).toBe("23:59");
  });

  it("switch preset: default value 0", () => {
    const sm = new StateManager(makeContext({ is_switch_preset: true }));
    expect(sm.getData()[0].value).toBe(0);
  });

  it("normal preset: default value = min_value", () => {
    const sm = new StateManager(makeContext({ min_value: 15 }));
    expect(sm.getData()[0].value).toBe(15);
  });

  it("missing min_value: default value 0", () => {
    const sm = new StateManager(makeContext({ min_value: undefined }));
    expect(sm.getData()[0].value).toBe(0);
  });

  it("registers the PRESET_CHANGED event", () => {
    const ctx = makeContext();
    new StateManager(ctx);
    expect(ctx.events.on).toHaveBeenCalledWith("PRESET_CHANGED", expect.any(Function));
  });

  it("initializes empty undo/redo stacks", () => {
    const sm = new StateManager(makeContext());
    expect(sm._undoStack).toHaveLength(0);
    expect(sm._redoStack).toHaveLength(0);
  });
});

// ─── getData ──────────────────────────────────────────────────────────────────
describe("StateManager – getData", () => {
  it("returns a copy of the array (not the reference)", () => {
    const sm = new StateManager(makeContext());
    const d = sm.getData();
    d.push({ time: "12:00", value: 99 });
    expect(sm.getData()).toHaveLength(2);
  });
});

// ─── getDataWithChangePoints ──────────────────────────────────────────────────
describe("StateManager – getDataWithChangePoints", () => {
  it("returns the same data as getData", () => {
    const sm = new StateManager(makeContext());
    expect(sm.getDataWithChangePoints()).toEqual(sm.getData());
  });
});

// ─── setData ─────────────────────────────────────────────────────────────────
describe("StateManager – setData", () => {
  let sm;
  beforeEach(() => { sm = new StateManager(makeContext()); });

  it("normalizes and saves points", () => {
    sm.setData([{ time: "06:00", value: 22 }, { time: "00:00", value: 20 }, { time: "23:59", value: 20 }]);
    expect(sm.getData().some((p) => p.time === "06:00")).toBe(true);
  });

  it("emits SCHEDULE_UPDATED", () => {
    sm.setData([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }]);
    const ctx = sm.context;
    expect(ctx.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });

  it("sets hasUnsavedChanges", () => {
    sm.setData([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }]);
    expect(sm.context.hasUnsavedChanges).toBe(true);
  });

  it("ignores non-array input and logs warning", () => {
    const before = sm.getData();
    sm.setData(null);
    expect(sm.getData()).toEqual(before);
  });

  it("skipHistory=true: does not add to undo stack", () => {
    sm.setData([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }], true);
    expect(sm.undo()).toBe(false);
  });

  it("skipHistory=false (default): adds to undo stack", () => {
    sm.setData([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }], false);
    expect(sm._undoStack.length).toBeGreaterThan(0);
  });

  it("switch preset: uses finalizeSwitchData", () => {
    const swSm = new StateManager(makeContext({ is_switch_preset: true }));
    swSm.setData([
      { time: "00:00", value: 0 },
      { time: "06:00", value: 1 },
      { time: "23:59", value: 0 },
    ]);
    expect(swSm.getData().length).toBeGreaterThan(3);
  });
});

// ─── insertPoint ─────────────────────────────────────────────────────────────
describe("StateManager – insertPoint", () => {
  let sm;
  beforeEach(() => { sm = new StateManager(makeContext()); });

  it("inserts a new point", () => {
    sm.insertPoint("12:00", 22);
    expect(sm.getData().some((p) => p.time === "12:00")).toBe(true);
  });

  it("updates value of an existing point at the same minute", () => {
    sm.insertPoint("12:00", 22);
    const countBefore = sm.getData().length;
    sm.insertPoint("12:01", 25);
    sm.insertPoint("12:00", 25);
    expect(sm.getData().length).toBe(countBefore + 1);
    expect(sm.getData().find((p) => p.time === "12:00").value).toBe(25);
  });

  it("emits POINT_ADDED and SCHEDULE_UPDATED for a new point", () => {
    sm.insertPoint("12:00", 22);
    expect(sm.context.events.emit).toHaveBeenCalledWith("POINT_ADDED", expect.any(Object));
    expect(sm.context.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });

  it("emits POINT_UPDATED for an already existing point", () => {
    sm.insertPoint("12:00", 22);
    sm.context.events.emit.mockClear();
    sm.insertPoint("12:00", 25);
    expect(sm.context.events.emit).toHaveBeenCalledWith("POINT_UPDATED", expect.any(Object));
  });

  it("returns the index of the inserted point", () => {
    const idx = sm.insertPoint("12:00", 22);
    expect(typeof idx).toBe("number");
    expect(idx).toBeGreaterThan(0);
  });

  it("inserts at the end if after all existing points", () => {
    sm.setData([{ time: "00:00", value: 15 }, { time: "23:59", value: 15 }], true);
    const idx = sm.insertPoint("23:58", 20);
    expect(sm.getData()[idx].time).toBe("23:58");
  });
});

// ─── removePoint ─────────────────────────────────────────────────────────────
describe("StateManager – removePoint", () => {
  let sm;
  beforeEach(() => {
    sm = new StateManager(makeContext());
    sm.insertPoint("12:00", 22);
  });

  it("removes an intermediate point", () => {
    const countBefore = sm.getData().length;
    const idx = sm.getData().findIndex((p) => p.time === "12:00");
    expect(sm.removePoint(idx)).toBe(true);
    expect(sm.getData().length).toBe(countBefore - 1);
  });

  it("does not remove the 00:00 point", () => {
    expect(sm.removePoint(0)).toBe(false);
  });

  it("does not remove the 23:59 point", () => {
    const last = sm.getData().length - 1;
    expect(sm.removePoint(last)).toBe(false);
  });

  it("returns false for index out of range", () => {
    expect(sm.removePoint(-1)).toBe(false);
    expect(sm.removePoint(9999)).toBe(false);
  });

  it("emits POINT_REMOVED and SCHEDULE_UPDATED", () => {
    const idx = sm.getData().findIndex((p) => p.time === "12:00");
    sm.context.events.emit.mockClear();
    sm.removePoint(idx);
    expect(sm.context.events.emit).toHaveBeenCalledWith("POINT_REMOVED", expect.any(Object));
    expect(sm.context.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });

  it("covers line 303 by refusing removal of 1440-minute boundary", () => {
    sm.scheduleData = [
      { time: "00:00", value: 15 },
      { time: "24:00", value: 15 },
    ];
    expect(sm.removePoint(1)).toBe(false);
  });
});

// ─── updatePoint ─────────────────────────────────────────────────────────────
describe("StateManager – updatePoint", () => {
  it("updates value of a valid point", () => {
    const sm = new StateManager(makeContext());
    sm.insertPoint("12:00", 22);
    const idx = sm.getData().findIndex((p) => p.time === "12:00");
    sm.updatePoint(idx, 28);
    expect(sm.getData().some((p) => p.value === 28)).toBe(true);
  });

  it("ignores indices out of range", () => {
    const sm = new StateManager(makeContext());
    const snapshot = JSON.stringify(sm.getData());
    sm.updatePoint(-1, 99);
    sm.updatePoint(999, 99);
    expect(JSON.stringify(sm.getData())).toBe(snapshot);
  });
});

// ─── alignSelectedPoints ─────────────────────────────────────────────────────
describe("StateManager – alignSelectedPoints", () => {
  let sm;
  beforeEach(() => {
    sm = new StateManager(makeContext());
    sm.insertPoint("06:00", 20);
    sm.insertPoint("12:00", 22);
    sm.insertPoint("18:00", 24);
  });

  it("align right: aligns to the value of the rightmost point (highest index)", () => {
    const d = sm.getData();
    const i06 = d.findIndex((p) => p.time === "06:00");
    const i12 = d.findIndex((p) => p.time === "12:00");
    sm.alignSelectedPoints("right", [i06, i12]);
    expect(sm.getData().find((p) => p.time === "06:00").value).toBe(22);
  });

  it("align left: aligns to the value of the leftmost point (lowest index)", () => {
    const d = sm.getData();
    const i06 = d.findIndex((p) => p.time === "06:00");
    const i12 = d.findIndex((p) => p.time === "12:00");
    sm.alignSelectedPoints("left", [i06, i12]);
    expect(sm.getData().find((p) => p.time === "12:00").value).toBe(20);
  });

  it("does nothing with fewer than 2 points", () => {
    const snapshot = JSON.stringify(sm.getData());
    sm.alignSelectedPoints("left", [1]);
    expect(JSON.stringify(sm.getData())).toBe(snapshot);
  });

  it("does nothing with empty list", () => {
    const snapshot = JSON.stringify(sm.getData());
    sm.alignSelectedPoints("left", []);
    expect(JSON.stringify(sm.getData())).toBe(snapshot);
  });

  it("uses selectionManager if no index provided", () => {
    const mockSel = { getSelectedPoints: vi.fn().mockReturnValue([]) };
    sm.context.getManager.mockReturnValue(mockSel);
    sm.alignSelectedPoints("left");
    expect(mockSel.getSelectedPoints).toHaveBeenCalled();
  });

  it("handles selectionManager = null gracefully", () => {
    sm.context.getManager.mockReturnValue(null);
    expect(() => sm.alignSelectedPoints("left")).not.toThrow();
  });

  it("filters invalid indices", () => {
    const d = sm.getData();
    const i06 = d.findIndex((p) => p.time === "06:00");
    const snapshot = JSON.stringify(sm.getData());
    sm.alignSelectedPoints("left", [i06, 9999]);
    expect(JSON.stringify(sm.getData())).toBe(snapshot);
  });

  it("does not touch the anchor point (anchorIndex remains unchanged)", () => {
    const d = sm.getData();
    const i06 = d.findIndex((p) => p.time === "06:00");
    const i12 = d.findIndex((p) => p.time === "12:00");
    const i18 = d.findIndex((p) => p.time === "18:00");
    const val18Before = sm.getData().find((p) => p.time === "18:00").value;
    sm.alignSelectedPoints("right", [i06, i12, i18]);
    expect(sm.getData().find((p) => p.time === "18:00").value).toBe(val18Before);
  });
});

// ─── undo / redo ─────────────────────────────────────────────────────────────
describe("StateManager – undo / redo", () => {
  let sm;
  beforeEach(() => { sm = new StateManager(makeContext()); });

  it("undo returns false with empty stack", () => expect(sm.undo()).toBe(false));
  it("redo returns false with empty stack", () => expect(sm.redo()).toBe(false));

  it("undo restores previous state", () => {
    const originalLength = sm.getData().length;
    sm.insertPoint("12:00", 22);
    sm.undo();
    expect(sm.getData().length).toBe(originalLength);
  });

  it("redo reapplies the undone change", () => {
    sm.insertPoint("12:00", 22);
    const afterInsert = sm.getData().length;
    sm.undo();
    sm.redo();
    expect(sm.getData().length).toBe(afterInsert);
  });

  it("a new action clears the redo stack", () => {
    sm.insertPoint("12:00", 22);
    sm.undo();
    sm.insertPoint("06:00", 20);
    expect(sm.redo()).toBe(false);
  });

  it("undo emits SCHEDULE_UPDATED", () => {
    sm.insertPoint("12:00", 22);
    sm.context.events.emit.mockClear();
    sm.undo();
    expect(sm.context.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });
});

// ─── getNumPoints / getPointLabel / getCurrentIndex ──────────────────────────
describe("StateManager – reading methods", () => {
  let sm;
  beforeEach(() => { sm = new StateManager(makeContext()); });

  it("getNumPoints: returns correct count", () => {
    expect(sm.getNumPoints()).toBe(2);
    sm.insertPoint("12:00", 22);
    expect(sm.getNumPoints()).toBe(3);
  });

  it("getPointLabel: returns point time", () => {
    expect(sm.getPointLabel(0)).toBe("00:00");
  });

  it("getPointLabel: returns '00:00' for invalid index", () => {
    expect(sm.getPointLabel(999)).toBe("00:00");
  });

  it("getCurrentIndex: returns a valid index", () => {
    const idx = sm.getCurrentIndex();
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(sm.getNumPoints());
  });
});

// ─── finalizeSwitchData ───────────────────────────────────────────────────────
describe("StateManager – finalizeSwitchData", () => {
  let swSm;
  beforeEach(() => {
    swSm = new StateManager(makeContext({ is_switch_preset: true }));
  });

  it("returns [] for null/falsy input", () => {
    expect(swSm.finalizeSwitchData(null)).toEqual([]);
    expect(swSm.finalizeSwitchData(undefined)).toEqual([]);
  });

  it("returns [] for empty array", () => {
    expect(swSm.finalizeSwitchData([])).toEqual([]);
  });

  it("adds T+1 point to transitions", () => {
    const data = [
      { time: "00:00", value: 0 },
      { time: "06:00", value: 1 },
      { time: "23:59", value: 0 },
    ];
    const result = swSm.finalizeSwitchData(data);
    expect(result.some((p) => p.time === "06:01")).toBe(true);
  });

  it("applies spike suppression rule", () => {
    const data = [
      { time: "00:00", value: 0 },
      { time: "06:00", value: 1 },
      { time: "06:01", value: 0 },
      { time: "06:02", value: 1 },
      { time: "23:59", value: 0 },
    ];
    const result = swSm.finalizeSwitchData(data);
    expect(result).toBeDefined();
  });

  it("does not add T+1 if it's already in the map (stepMin already present)", () => {
    const data = [
      { time: "00:00", value: 0 },
      { time: "06:00", value: 1 },
      { time: "06:01", value: 1 },
      { time: "23:59", value: 0 },
    ];
    const result = swSm.finalizeSwitchData(data);
    const count = result.filter((p) => p.time === "06:01").length;
    expect(count).toBeLessThanOrEqual(1);
  });

  it("does not add T+1 if stepMin >= 1440 (transition at 23:59)", () => {
    const data = [
      { time: "00:00", value: 0 },
      { time: "23:58", value: 1 },
      { time: "23:59", value: 0 },
    ];
    const result = swSm.finalizeSwitchData(data);
    expect(result.every((p) => {
      const parts = p.time.split(":");
      return Number(parts[0]) * 60 + Number(parts[1]) < 1440;
    })).toBe(true);
  });

  it("normalizes input in final deduplication", () => {
    const data = [
      { time: "00:00", value: 0 },
      { time: "06:00", value: 0 },
      { time: "23:59", value: 0 },
    ];
    const result = swSm.finalizeSwitchData(data);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles empty normalized input after _normalizeSchedule", () => {
    const result = swSm.finalizeSwitchData([null, undefined, { bad: true }]);
    expect(result).toEqual([]);
  });
});

// ─── _normalizeSchedule ───────────────────────────────────────────────────────
describe("StateManager – _normalizeSchedule (via setData)", () => {
  let sm;
  beforeEach(() => { sm = new StateManager(makeContext()); });

  it("accepts {x, y} format", () => {
    sm.setData([{ x: 0, y: 20 }, { x: 1439, y: 20 }]);
    expect(sm.getData()[0].time).toBe("00:00");
  });

  it("ignores null or non-object elements", () => {
    sm.setData([null, "string", 42, { time: "00:00", value: 20 }, { time: "23:59", value: 20 }]);
    expect(sm.getData()[0].time).toBe("00:00");
  });

  it("corrects NaN values to 0", () => {
    sm.setData([{ time: "00:00", value: NaN }, { time: "23:59", value: 20 }]);
    expect(sm.getData()[0].value).toBe(0);
  });

  it("ignores entries with invalid time format", () => {
    sm.setData([
      { time: "invalid", value: 20 },
      { time: "00:00", value: 15 },
      { time: "23:59", value: 15 },
    ]);
    expect(sm.getData().every((p) => /^\d{2}:\d{2}$/.test(p.time))).toBe(true);
  });

  it("deduplicates points at the same minute (uses the last value)", () => {
    sm.setData([
      { time: "06:00", value: 20 },
      { time: "06:00", value: 25 },
      { time: "00:00", value: 15 },
      { time: "23:59", value: 15 },
    ]);
    const dups = sm.getData().filter((p) => p.time === "06:00");
    expect(dups).toHaveLength(1);
  });
});

// ─── _ensureBoundaries ────────────────────────────────────────────────────────
describe("StateManager – _ensureBoundaries", () => {
  it("adds 00:00 if missing", () => {
    const sm = new StateManager(makeContext());
    sm.scheduleData = [{ time: "12:00", value: 20 }, { time: "23:59", value: 20 }];
    sm._ensureBoundaries();
    expect(sm.getData()[0].time).toBe("00:00");
  });

  it("adds 23:59 if missing", () => {
    const sm = new StateManager(makeContext());
    sm.scheduleData = [{ time: "00:00", value: 20 }, { time: "12:00", value: 22 }];
    sm._ensureBoundaries();
    expect(sm.getData()[sm.getData().length - 1].time).toBe("23:59");
  });

  it("switch preset: uses 0 for missing initial value", () => {
    const sm = new StateManager(makeContext({ is_switch_preset: true }));
    sm.scheduleData = [{ time: "12:00", value: 1 }, { time: "23:59", value: 0 }];
    sm._ensureBoundaries();
    expect(sm.getData()[0].value).toBe(0);
  });

  it("normal preset: uses the value of the first point or min_value", () => {
    const sm = new StateManager(makeContext({ min_value: 18 }));
    sm.scheduleData = [{ time: "12:00", value: 22 }, { time: "23:59", value: 22 }];
    sm._ensureBoundaries();
    expect(sm.getData()[0].value).toBe(22);
  });

  it("uses min_value if scheduleData is empty", () => {
    const sm = new StateManager(makeContext({ min_value: 18 }));
    sm.scheduleData = [{ time: "23:59", value: 18 }];
    sm._ensureBoundaries();
    expect(sm.getData()[0].value).toBe(18);
  });
});

// ─── PRESET_CHANGED event ────────────────────────────────────────────────────
describe("StateManager – PRESET_CHANGED", () => {
  it("re-initializes the schedule and emits SCHEDULE_UPDATED", () => {
    const ctx = makeContext();
    const sm = new StateManager(ctx);
    sm.insertPoint("12:00", 22);
    ctx.events.emit.mockClear();
    ctx._listeners["PRESET_CHANGED"]?.();
    expect(sm.getData()).toHaveLength(2);
    expect(ctx.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });
});

// ─── _pushHistory – limits and guards ─────────────────────────────────────────
describe("StateManager – _pushHistory", () => {
  it("does not add if isLoadingProfile is true", () => {
    const sm = new StateManager(makeContext());
    sm.isLoadingProfile = true;
    const before = sm._undoStack.length;
    sm._pushHistory();
    expect(sm._undoStack.length).toBe(before);
    sm.isLoadingProfile = false;
  });

  it("does not add consecutive duplicate snapshots", () => {
    const sm = new StateManager(makeContext());
    sm._pushHistory();
    const after1 = sm._undoStack.length;
    sm._pushHistory();
    expect(sm._undoStack.length).toBe(after1);
  });

  it("limits stack to maxHistory (50)", () => {
    const sm = new StateManager(makeContext());
    for (let i = 1; i <= 55; i++) {
      const hh = String(Math.floor(i / 60)).padStart(2, "0");
      const mm = String(i % 60).padStart(2, "0");
      sm.insertPoint(`${hh}:${mm}`, i);
    }
    expect(sm._undoStack.length).toBeLessThanOrEqual(50);
  });
});

// ─── destroy ─────────────────────────────────────────────────────────────────
describe("StateManager – destroy", () => {
  it("clears undo/redo stacks", () => {
    const sm = new StateManager(makeContext());
    sm.insertPoint("12:00", 22);
    sm.destroy();
    expect(sm.undo()).toBe(false);
    expect(sm.redo()).toBe(false);
  });
});
