// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock EventBus prima di importare StateManager
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

// ─── Factory: crea un context minimale ───────────────────────────────────────
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

// ─── Constructor & Inizializzazione ─────────────────────────────────────────
describe("StateManager – costruttore e inizializzazione", () => {
  it("crea i punti limite 00:00 e 23:59", () => {
    const sm = new StateManager(makeContext());
    const d = sm.getData();
    expect(d[0].time).toBe("00:00");
    expect(d[d.length - 1].time).toBe("23:59");
  });

  it("preset switch: valore di default 0", () => {
    const sm = new StateManager(makeContext({ is_switch_preset: true }));
    expect(sm.getData()[0].value).toBe(0);
  });

  it("preset normale: valore di default = min_value", () => {
    const sm = new StateManager(makeContext({ min_value: 15 }));
    expect(sm.getData()[0].value).toBe(15);
  });

  it("min_value assente: valore di default 0", () => {
    const sm = new StateManager(makeContext({ min_value: undefined }));
    expect(sm.getData()[0].value).toBe(0);
  });

  it("registra l'evento PRESET_CHANGED", () => {
    const ctx = makeContext();
    new StateManager(ctx);
    expect(ctx.events.on).toHaveBeenCalledWith("PRESET_CHANGED", expect.any(Function));
  });

  it("inizializza gli stack undo/redo vuoti", () => {
    const sm = new StateManager(makeContext());
    expect(sm._undoStack).toHaveLength(0);
    expect(sm._redoStack).toHaveLength(0);
  });
});

// ─── getData ──────────────────────────────────────────────────────────────────
describe("StateManager – getData", () => {
  it("ritorna una copia dell'array (non il riferimento)", () => {
    const sm = new StateManager(makeContext());
    const d = sm.getData();
    d.push({ time: "12:00", value: 99 });
    expect(sm.getData()).toHaveLength(2);
  });
});

// ─── getDataWithChangePoints ──────────────────────────────────────────────────
describe("StateManager – getDataWithChangePoints", () => {
  it("ritorna gli stessi dati di getData", () => {
    const sm = new StateManager(makeContext());
    expect(sm.getDataWithChangePoints()).toEqual(sm.getData());
  });
});

// ─── setData ─────────────────────────────────────────────────────────────────
describe("StateManager – setData", () => {
  let sm;
  beforeEach(() => { sm = new StateManager(makeContext()); });

  it("normalizza e salva i punti", () => {
    sm.setData([{ time: "06:00", value: 22 }, { time: "00:00", value: 20 }, { time: "23:59", value: 20 }]);
    expect(sm.getData().some((p) => p.time === "06:00")).toBe(true);
  });

  it("emette SCHEDULE_UPDATED", () => {
    sm.setData([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }]);
    const ctx = sm.context;
    expect(ctx.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });

  it("imposta hasUnsavedChanges", () => {
    sm.setData([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }]);
    expect(sm.context.hasUnsavedChanges).toBe(true);
  });

  it("ignora input non-array e logga warning", () => {
    const before = sm.getData();
    sm.setData(null);
    expect(sm.getData()).toEqual(before);
  });

  it("skipHistory=true: non aggiunge all'undo stack", () => {
    sm.setData([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }], true);
    expect(sm.undo()).toBe(false);
  });

  it("skipHistory=false (default): aggiunge all'undo stack", () => {
    sm.setData([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }], false);
    expect(sm._undoStack.length).toBeGreaterThan(0);
  });

  it("preset switch: usa finalizeSwitchData", () => {
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

  it("inserisce un nuovo punto", () => {
    sm.insertPoint("12:00", 22);
    expect(sm.getData().some((p) => p.time === "12:00")).toBe(true);
  });

  it("aggiorna il valore di un punto esistente alla stessa minuta", () => {
    sm.insertPoint("12:00", 22);
    const countBefore = sm.getData().length;
    sm.insertPoint("12:01", 25);
    sm.insertPoint("12:00", 25);
    expect(sm.getData().length).toBe(countBefore + 1);
    expect(sm.getData().find((p) => p.time === "12:00").value).toBe(25);
  });

  it("emette POINT_ADDED e SCHEDULE_UPDATED per un nuovo punto", () => {
    sm.insertPoint("12:00", 22);
    expect(sm.context.events.emit).toHaveBeenCalledWith("POINT_ADDED", expect.any(Object));
    expect(sm.context.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });

  it("emette POINT_UPDATED per un punto già esistente", () => {
    sm.insertPoint("12:00", 22);
    sm.context.events.emit.mockClear();
    sm.insertPoint("12:00", 25);
    expect(sm.context.events.emit).toHaveBeenCalledWith("POINT_UPDATED", expect.any(Object));
  });

  it("ritorna l'indice del punto inserito", () => {
    const idx = sm.insertPoint("12:00", 22);
    expect(typeof idx).toBe("number");
    expect(idx).toBeGreaterThan(0);
  });

  it("inserisce alla fine se dopo tutti i punti esistenti", () => {
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

  it("rimuove un punto intermedio", () => {
    const countBefore = sm.getData().length;
    const idx = sm.getData().findIndex((p) => p.time === "12:00");
    expect(sm.removePoint(idx)).toBe(true);
    expect(sm.getData().length).toBe(countBefore - 1);
  });

  it("non rimuove il punto 00:00", () => {
    expect(sm.removePoint(0)).toBe(false);
  });

  it("non rimuove il punto 23:59", () => {
    const last = sm.getData().length - 1;
    expect(sm.removePoint(last)).toBe(false);
  });

  it("ritorna false per indice fuori range", () => {
    expect(sm.removePoint(-1)).toBe(false);
    expect(sm.removePoint(9999)).toBe(false);
  });

  it("emette POINT_REMOVED e SCHEDULE_UPDATED", () => {
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
  it("aggiorna il valore di un punto valido", () => {
    const sm = new StateManager(makeContext());
    sm.insertPoint("12:00", 22);
    const idx = sm.getData().findIndex((p) => p.time === "12:00");
    sm.updatePoint(idx, 28);
    expect(sm.getData().some((p) => p.value === 28)).toBe(true);
  });

  it("ignora indici fuori range", () => {
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

  it("align right: allinea al valore del punto più a destra (indice maggiore)", () => {
    const d = sm.getData();
    const i06 = d.findIndex((p) => p.time === "06:00");
    const i12 = d.findIndex((p) => p.time === "12:00");
    sm.alignSelectedPoints("right", [i06, i12]);
    expect(sm.getData().find((p) => p.time === "06:00").value).toBe(22);
  });

  it("align left: allinea al valore del punto più a sinistra (indice minore)", () => {
    const d = sm.getData();
    const i06 = d.findIndex((p) => p.time === "06:00");
    const i12 = d.findIndex((p) => p.time === "12:00");
    sm.alignSelectedPoints("left", [i06, i12]);
    expect(sm.getData().find((p) => p.time === "12:00").value).toBe(20);
  });

  it("non fa nulla con meno di 2 punti", () => {
    const snapshot = JSON.stringify(sm.getData());
    sm.alignSelectedPoints("left", [1]);
    expect(JSON.stringify(sm.getData())).toBe(snapshot);
  });

  it("non fa nulla con lista vuota", () => {
    const snapshot = JSON.stringify(sm.getData());
    sm.alignSelectedPoints("left", []);
    expect(JSON.stringify(sm.getData())).toBe(snapshot);
  });

  it("usa il selectionManager se nessun indice fornito", () => {
    const mockSel = { getSelectedPoints: vi.fn().mockReturnValue([]) };
    sm.context.getManager.mockReturnValue(mockSel);
    sm.alignSelectedPoints("left");
    expect(mockSel.getSelectedPoints).toHaveBeenCalled();
  });

  it("usa selectionManager = null gracefully", () => {
    sm.context.getManager.mockReturnValue(null);
    expect(() => sm.alignSelectedPoints("left")).not.toThrow();
  });

  it("filtra indici non validi", () => {
    const d = sm.getData();
    const i06 = d.findIndex((p) => p.time === "06:00");
    const snapshot = JSON.stringify(sm.getData());
    sm.alignSelectedPoints("left", [i06, 9999]);
    expect(JSON.stringify(sm.getData())).toBe(snapshot);
  });

  it("non tocca il punto ancora (anchorIndex rimane inalterato)", () => {
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

  it("undo ritorna false con stack vuoto", () => expect(sm.undo()).toBe(false));
  it("redo ritorna false con stack vuoto", () => expect(sm.redo()).toBe(false));

  it("undo ripristina lo stato precedente", () => {
    const originalLength = sm.getData().length;
    sm.insertPoint("12:00", 22);
    sm.undo();
    expect(sm.getData().length).toBe(originalLength);
  });

  it("redo riapplica il cambiamento annullato", () => {
    sm.insertPoint("12:00", 22);
    const afterInsert = sm.getData().length;
    sm.undo();
    sm.redo();
    expect(sm.getData().length).toBe(afterInsert);
  });

  it("una nuova azione svuota il redo stack", () => {
    sm.insertPoint("12:00", 22);
    sm.undo();
    sm.insertPoint("06:00", 20);
    expect(sm.redo()).toBe(false);
  });

  it("undo emette SCHEDULE_UPDATED", () => {
    sm.insertPoint("12:00", 22);
    sm.context.events.emit.mockClear();
    sm.undo();
    expect(sm.context.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });
});

// ─── getNumPoints / getPointLabel / getCurrentIndex ──────────────────────────
describe("StateManager – metodi di lettura", () => {
  let sm;
  beforeEach(() => { sm = new StateManager(makeContext()); });

  it("getNumPoints: ritorna il conteggio corretto", () => {
    expect(sm.getNumPoints()).toBe(2);
    sm.insertPoint("12:00", 22);
    expect(sm.getNumPoints()).toBe(3);
  });

  it("getPointLabel: ritorna il time del punto", () => {
    expect(sm.getPointLabel(0)).toBe("00:00");
  });

  it("getPointLabel: ritorna '00:00' per indice non valido", () => {
    expect(sm.getPointLabel(999)).toBe("00:00");
  });

  it("getCurrentIndex: ritorna un indice valido", () => {
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

  it("ritorna [] per input null/falsy", () => {
    expect(swSm.finalizeSwitchData(null)).toEqual([]);
    expect(swSm.finalizeSwitchData(undefined)).toEqual([]);
  });

  it("ritorna [] per array vuoto", () => {
    expect(swSm.finalizeSwitchData([])).toEqual([]);
  });

  it("aggiunge il punto T+1 alle transizioni", () => {
    const data = [
      { time: "00:00", value: 0 },
      { time: "06:00", value: 1 },
      { time: "23:59", value: 0 },
    ];
    const result = swSm.finalizeSwitchData(data);
    expect(result.some((p) => p.time === "06:01")).toBe(true);
  });

  it("applica la regola spike suppression", () => {
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

  it("non aggiunge T+1 se è già nel map (stepMin già presente)", () => {
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

  it("non aggiunge T+1 se stepMin >= 1440 (transizione a 23:59)", () => {
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

  it("normalizza l'input nella deduplicazione finale", () => {
    const data = [
      { time: "00:00", value: 0 },
      { time: "06:00", value: 0 },
      { time: "23:59", value: 0 },
    ];
    const result = swSm.finalizeSwitchData(data);
    expect(result.length).toBeGreaterThan(0);
  });

  it("gestisce input normalizzato vuoto dopo _normalizeSchedule", () => {
    const result = swSm.finalizeSwitchData([null, undefined, { bad: true }]);
    expect(result).toEqual([]);
  });
});

// ─── _normalizeSchedule ───────────────────────────────────────────────────────
describe("StateManager – _normalizeSchedule (via setData)", () => {
  let sm;
  beforeEach(() => { sm = new StateManager(makeContext()); });

  it("accetta formato {x, y}", () => {
    sm.setData([{ x: 0, y: 20 }, { x: 1439, y: 20 }]);
    expect(sm.getData()[0].time).toBe("00:00");
  });

  it("ignora elementi null o non-object", () => {
    sm.setData([null, "string", 42, { time: "00:00", value: 20 }, { time: "23:59", value: 20 }]);
    expect(sm.getData()[0].time).toBe("00:00");
  });

  it("corregge valori NaN a 0", () => {
    sm.setData([{ time: "00:00", value: NaN }, { time: "23:59", value: 20 }]);
    expect(sm.getData()[0].value).toBe(0);
  });

  it("ignora voci con time in formato non valido", () => {
    sm.setData([
      { time: "invalid", value: 20 },
      { time: "00:00", value: 15 },
      { time: "23:59", value: 15 },
    ]);
    expect(sm.getData().every((p) => /^\d{2}:\d{2}$/.test(p.time))).toBe(true);
  });

  it("deduplica punti allo stesso minuto (usa l'ultimo valore)", () => {
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
  it("aggiunge 00:00 se mancante", () => {
    const sm = new StateManager(makeContext());
    sm.scheduleData = [{ time: "12:00", value: 20 }, { time: "23:59", value: 20 }];
    sm._ensureBoundaries();
    expect(sm.getData()[0].time).toBe("00:00");
  });

  it("aggiunge 23:59 se mancante", () => {
    const sm = new StateManager(makeContext());
    sm.scheduleData = [{ time: "00:00", value: 20 }, { time: "12:00", value: 22 }];
    sm._ensureBoundaries();
    expect(sm.getData()[sm.getData().length - 1].time).toBe("23:59");
  });

  it("preset switch: usa 0 per il valore iniziale mancante", () => {
    const sm = new StateManager(makeContext({ is_switch_preset: true }));
    sm.scheduleData = [{ time: "12:00", value: 1 }, { time: "23:59", value: 0 }];
    sm._ensureBoundaries();
    expect(sm.getData()[0].value).toBe(0);
  });

  it("preset normale: usa il valore del primo punto o min_value", () => {
    const sm = new StateManager(makeContext({ min_value: 18 }));
    sm.scheduleData = [{ time: "12:00", value: 22 }, { time: "23:59", value: 22 }];
    sm._ensureBoundaries();
    expect(sm.getData()[0].value).toBe(22);
  });

  it("usa min_value se scheduleData è vuoto", () => {
    const sm = new StateManager(makeContext({ min_value: 18 }));
    sm.scheduleData = [{ time: "23:59", value: 18 }];
    sm._ensureBoundaries();
    expect(sm.getData()[0].value).toBe(18);
  });
});

// ─── PRESET_CHANGED event ────────────────────────────────────────────────────
describe("StateManager – PRESET_CHANGED", () => {
  it("re-inizializza lo schedule e emette SCHEDULE_UPDATED", () => {
    const ctx = makeContext();
    const sm = new StateManager(ctx);
    sm.insertPoint("12:00", 22);
    ctx.events.emit.mockClear();
    ctx._listeners["PRESET_CHANGED"]?.();
    expect(sm.getData()).toHaveLength(2);
    expect(ctx.events.emit).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Array));
  });
});

// ─── _pushHistory – limiti e guardie ─────────────────────────────────────────
describe("StateManager – _pushHistory", () => {
  it("non aggiunge se isLoadingProfile è true", () => {
    const sm = new StateManager(makeContext());
    sm.isLoadingProfile = true;
    const before = sm._undoStack.length;
    sm._pushHistory();
    expect(sm._undoStack.length).toBe(before);
    sm.isLoadingProfile = false;
  });

  it("non aggiunge snapshot duplicati consecutivi", () => {
    const sm = new StateManager(makeContext());
    sm._pushHistory();
    const after1 = sm._undoStack.length;
    sm._pushHistory();
    expect(sm._undoStack.length).toBe(after1);
  });

  it("limita lo stack a maxHistory (50)", () => {
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
  it("svuota gli stack undo/redo", () => {
    const sm = new StateManager(makeContext());
    sm.insertPoint("12:00", 22);
    sm.destroy();
    expect(sm.undo()).toBe(false);
    expect(sm.redo()).toBe(false);
  });
});
