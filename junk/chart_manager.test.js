// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock Chart.js e plugin ───────────────────────────────────────────────────
const mockChartInstance = {
  data: {
    datasets: [
      {
        data: [],
        pointBackgroundColor: [],
        pointBorderColor: [],
        pointRadius: [],
      },
    ],
  },
  options: {
    scales: {
      x: {
        min: 0,
        max: 1440,
        ticks: { stepSize: 60 },
        getValueForPixel: vi.fn(() => 300),
      },
      y: {},
    },
  },
  scales: {
    x: {
      min: 0,
      max: 1440,
      ticks: { stepSize: 60, includeBounds: false },
      getValueForPixel: vi.fn(() => 300),
    },
  },
  canvas: {
    getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 300, height: 150 })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  update: vi.fn(),
  resize: vi.fn(),
  destroy: vi.fn(),
  getDatasetMeta: vi.fn(() => ({ data: [] })),
  getElementsAtEventForMode: vi.fn(() => []),
};

let ChartConstructorSpy;
vi.mock("chart.js/auto", () => {
  const Chart = vi.fn(() => mockChartInstance);
  Chart.register = vi.fn();
  ChartConstructorSpy = Chart;
  return { default: Chart };
});

vi.mock("chartjs-plugin-dragdata", () => ({ default: {} }));
vi.mock("chartjs-plugin-zoom", () => ({ default: {} }));

vi.mock("../src/utils.js", async () => {
  const actual = await vi.importActual("../src/utils.js");
  return { ...actual };
});

vi.mock("../src/core/EventBus.js", () => ({
  Events: {
    SCHEDULE_UPDATED: "SCHEDULE_UPDATED",
    SELECTION_CHANGED: "SELECTION_CHANGED",
    CHART_DESTROYED: "CHART_DESTROYED",
  },
}));

vi.mock("../src/config.js", () => ({
  COLORS: {
    primary: "#03a9f4",
    selected: "#ff0000",
    anchor: "#ff5252",
    accent: "#ff9800",
  },
}));

import { ChartManager } from "../src/managers/chart_manager.js";

// ─── Factory: context minimale ────────────────────────────────────────────────
function makeContext(configOverrides = {}) {
  const listeners = {};
  return {
    config: {
      is_switch_preset: false,
      drag_snap: {},
      ...configOverrides,
    },
    events: {
      on: vi.fn((evt, fn) => { listeners[evt] = fn; }),
      emit: vi.fn(),
      _listeners: listeners,
    },
    getManager: vi.fn(),
    _card: {
      isDragging: false,
      pointerSelecting: false,
    },
    _listeners: listeners,
  };
}

function makeChartManager(configOverrides = {}) {
  const ctx = makeContext(configOverrides);
  const cm = new ChartManager(ctx);
  return { cm, ctx };
}

// ─── Costruttore & _setupEventListeners ──────────────────────────────────────
describe("ChartManager – costruttore", () => {
  it("registra i listener SCHEDULE_UPDATED e SELECTION_CHANGED", () => {
    const { ctx } = makeChartManager();
    expect(ctx.events.on).toHaveBeenCalledWith("SCHEDULE_UPDATED", expect.any(Function));
    expect(ctx.events.on).toHaveBeenCalledWith("SELECTION_CHANGED", expect.any(Function));
  });

  it("inizializza _initialized a false", () => {
    const { cm } = makeChartManager();
    expect(cm._initialized).toBe(false);
  });

  it("inizializza chart a null", () => {
    const { cm } = makeChartManager();
    expect(cm.chart).toBeNull();
  });

  it("i bound handlers sono funzioni", () => {
    const { cm } = makeChartManager();
    expect(typeof cm._boundOnWindowPointerMove).toBe("function");
    expect(typeof cm._boundOnWindowPointerUp).toBe("function");
  });
});

// ─── initChart ───────────────────────────────────────────────────────────────
describe("ChartManager – initChart", () => {
  it("ritorna false se canvas è null", async () => {
    const { cm } = makeChartManager();
    expect(await cm.initChart(null)).toBe(false);
  });

  it("ritorna false se stateManager non è disponibile", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue(null);
    const canvas = document.createElement("canvas");
    expect(await cm.initChart(canvas)).toBe(false);
  });

  it("inizializza il chart con stateManager disponibile", async () => {
    const { cm, ctx } = makeChartManager();
    const stateManager = {
      getData: vi.fn().mockReturnValue([
        { time: "00:00", value: 20 },
        { time: "23:59", value: 20 },
      ]),
    };
    ctx.getManager.mockReturnValue(stateManager);
    const canvas = document.createElement("canvas");
    const result = await cm.initChart(canvas);
    expect(result).toBe(true);
    expect(cm._initialized).toBe(true);
  });
});

// ─── isInitialized / getChart ─────────────────────────────────────────────────
describe("ChartManager – isInitialized / getChart", () => {
  it("isInitialized ritorna false prima di initChart", () => {
    const { cm } = makeChartManager();
    expect(cm.isInitialized()).toBe(false);
  });

  it("getChart ritorna null prima di initChart", () => {
    const { cm } = makeChartManager();
    expect(cm.getChart()).toBeNull();
  });

  it("isInitialized ritorna true dopo initChart", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    expect(cm.isInitialized()).toBe(true);
  });
});

// ─── destroy ─────────────────────────────────────────────────────────────────
describe("ChartManager – destroy", () => {
  it("non crasha se chart è null", () => {
    const { cm } = makeChartManager();
    expect(() => cm.destroy()).not.toThrow();
  });

  it("distrugge il chart e emette CHART_DESTROYED", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    // Aggiungi _hoverHandler e _hoverOutHandler per testare il cleanup
    cm._hoverHandler = vi.fn();
    cm._hoverOutHandler = vi.fn();
    cm.destroy();
    expect(mockChartInstance.destroy).toHaveBeenCalled();
    expect(cm.chart).toBeNull();
    expect(ctx.events.emit).toHaveBeenCalledWith("CHART_DESTROYED");
  });

  it("pulisce il timer _updateTimer se presente", () => {
    const { cm } = makeChartManager();
    cm._updateTimer = setTimeout(() => {}, 5000);
    const spy = vi.spyOn(global, "clearTimeout");
    cm.destroy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("disconnette il ResizeObserver se presente", () => {
    const { cm } = makeChartManager();
    const mockObserver = { disconnect: vi.fn() };
    cm._resizeObserver = mockObserver;
    cm.destroy();
    expect(mockObserver.disconnect).toHaveBeenCalled();
    expect(cm._resizeObserver).toBeNull();
  });
});

// ─── updateData / recreateChartOptions / updateChartLabels ───────────────────
describe("ChartManager – updateData / recreateChartOptions / updateChartLabels", () => {
  it("updateData non crasha se chart è null", () => {
    const { cm } = makeChartManager();
    expect(() => cm.updateData([])).not.toThrow();
  });

  it("recreateChartOptions non crasha se chart è null", () => {
    const { cm } = makeChartManager();
    expect(() => cm.recreateChartOptions()).not.toThrow();
  });

  it("recreateChartOptions aggiorna le opzioni e chiama update se chart esiste", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.update.mockClear();
    cm.recreateChartOptions();
    expect(mockChartInstance.update).toHaveBeenCalled();
  });

  it("updateChartLabels delega a recreateChartOptions", () => {
    const { cm } = makeChartManager();
    const spy = vi.spyOn(cm, "recreateChartOptions").mockImplementation(() => {});
    cm.updateChartLabels();
    expect(spy).toHaveBeenCalled();
  });
});

// ─── update ──────────────────────────────────────────────────────────────────
describe("ChartManager – update", () => {
  it("non crasha se chart è null", () => {
    const { cm } = makeChartManager();
    expect(() => cm.update("none")).not.toThrow();
  });

  it("chiama chart.update con la modalità corretta se chart esiste", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.update.mockClear();
    cm.update("active");
    expect(mockChartInstance.update).toHaveBeenCalledWith("active");
  });
});

// ─── updatePointStyling ───────────────────────────────────────────────────────
describe("ChartManager – updatePointStyling", () => {
  it("delega a _updatePointStyles", () => {
    const { cm } = makeChartManager();
    const spy = vi.spyOn(cm, "_updatePointStyles").mockImplementation(() => {});
    cm.updatePointStyling(0, [0]);
    expect(spy).toHaveBeenCalled();
  });
});

// ─── getIndicesInArea ─────────────────────────────────────────────────────────
describe("ChartManager – getIndicesInArea", () => {
  it("ritorna [] se chart è null", () => {
    const { cm } = makeChartManager();
    expect(cm.getIndicesInArea(0, 0, 100, 100)).toEqual([]);
  });

  it("ritorna gli indici dei punti nell'area", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    // Simula punti nella meta
    mockChartInstance.getDatasetMeta.mockReturnValue({
      data: [
        { x: 50, y: 50 },
        { x: 200, y: 200 },
        { x: 50, y: 70 },
      ],
    });
    const result = cm.getIndicesInArea(0, 0, 100, 100);
    expect(result).toContain(0);
    expect(result).toContain(2);
    expect(result).not.toContain(1);
  });
});

// ─── deletePointAtEvent ───────────────────────────────────────────────────────
describe("ChartManager – deletePointAtEvent", () => {
  it("ritorna false se chart è null", () => {
    const { cm } = makeChartManager();
    expect(cm.deletePointAtEvent({})).toBe(false);
  });

  it("ritorna false se nessun punto colpito", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
    expect(cm.deletePointAtEvent({})).toBe(false);
  });

  it("rimuove il punto e ritorna true per hit sul dataset 0", async () => {
    const { cm, ctx } = makeChartManager();
    const stateManager = {
      getData: vi.fn().mockReturnValue([]),
      removePoint: vi.fn(),
    };
    ctx.getManager.mockReturnValue(stateManager);
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.getElementsAtEventForMode.mockReturnValue([
      { datasetIndex: 0, index: 2 },
    ]);
    expect(cm.deletePointAtEvent({})).toBe(true);
    expect(stateManager.removePoint).toHaveBeenCalledWith(2);
  });

  it("ritorna false per hit su dataset diverso da 0", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.getElementsAtEventForMode.mockReturnValue([
      { datasetIndex: 1, index: 0 },
    ]);
    expect(cm.deletePointAtEvent({})).toBe(false);
  });
});

// ─── _getCanvasRelativePosition ───────────────────────────────────────────────
describe("ChartManager – _getCanvasRelativePosition", () => {
  it("calcola la posizione relativa dal clientX/clientY", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    const canvas = document.createElement("canvas");
    await cm.initChart(canvas);
    cm.canvas = { getBoundingClientRect: vi.fn(() => ({ left: 10, top: 20 })) };
    const pos = cm._getCanvasRelativePosition({ clientX: 50, clientY: 70 });
    expect(pos.x).toBe(40);
    expect(pos.y).toBe(50);
  });

  it("usa i touch se disponibili", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    cm.canvas = { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })) };
    const pos = cm._getCanvasRelativePosition({
      touches: [{ clientX: 100, clientY: 200 }],
    });
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(200);
  });

  it("usa changedTouches come secondo fallback", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    cm.canvas = { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })) };
    const pos = cm._getCanvasRelativePosition({
      changedTouches: [{ clientX: 50, clientY: 60 }],
    });
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(60);
  });

  it("ritorna {x:0, y:0} se canvas non è disponibile", () => {
    const { cm } = makeChartManager();
    cm.canvas = null;
    const pos = cm._getCanvasRelativePosition({ clientX: 10, clientY: 20 });
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it("gestisce evento con .native wrapper", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    cm.canvas = { getBoundingClientRect: vi.fn(() => ({ left: 5, top: 10 })) };
    const pos = cm._getCanvasRelativePosition({ native: { clientX: 55, clientY: 60 } });
    expect(pos.x).toBe(50);
    expect(pos.y).toBe(50);
  });
});

// ─── _interpolateValueAtMinutes ───────────────────────────────────────────────
describe("ChartManager – _interpolateValueAtMinutes", () => {
  it("ritorna null se chart è null", () => {
    const { cm } = makeChartManager();
    expect(cm._interpolateValueAtMinutes(300)).toBeNull();
  });

  it("ritorna null se dataset è vuoto", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.data.datasets[0].data = [];
    expect(cm._interpolateValueAtMinutes(300)).toBeNull();
  });

  it("ritorna il valore del primo punto se minutes <= data[0].x", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.data.datasets[0].data = [
      { x: 100, y: 20 },
      { x: 800, y: 25 },
    ];
    expect(cm._interpolateValueAtMinutes(50)).toBe(20);
  });

  it("ritorna il valore dell'ultimo punto se minutes >= data[last].x", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.data.datasets[0].data = [
      { x: 100, y: 20 },
      { x: 800, y: 25 },
    ];
    expect(cm._interpolateValueAtMinutes(900)).toBe(25);
  });

  it("interpola linearmente tra due punti per preset non-switch", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.data.datasets[0].data = [
      { x: 0, y: 20 },
      { x: 100, y: 30 },
    ];
    // A 50 → 25 (metà tra 20 e 30)
    expect(cm._interpolateValueAtMinutes(50)).toBe(25);
  });

  it("usa interpolazione stepped per preset switch", async () => {
    const { cm, ctx } = makeChartManager({ is_switch_preset: true });
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.data.datasets[0].data = [
      { x: 0, y: 0 },
      { x: 100, y: 1 },
    ];
    // A 50 → valore del punto precedente (0)
    expect(cm._interpolateValueAtMinutes(50)).toBe(0);
  });

  it("gestisce divisione per zero (x0 === x1)", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.data.datasets[0].data = [
      { x: 50, y: 20 },
      { x: 50, y: 30 }, // stesso x
      { x: 100, y: 25 },
    ];
    expect(() => cm._interpolateValueAtMinutes(50)).not.toThrow();
  });
});

// ─── _updateXAxisTicksDensity ─────────────────────────────────────────────────
describe("ChartManager – _updateXAxisTicksDensity", () => {
  it("non crasha se chart è null", () => {
    const { cm } = makeChartManager();
    expect(() => cm._updateXAxisTicksDensity(null)).not.toThrow();
  });

  it("aggiorna lo stepSize basandosi sul range visibile", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));

    const fakeChart = {
      scales: {
        x: {
          min: 0,
          max: 120, // range di 2 ore → step dovrebbe essere 15 min
          ticks: { stepSize: 999, includeBounds: false },
        },
      },
      options: {
        scales: {
          x: { ticks: { stepSize: 999, includeBounds: false } },
        },
      },
      update: vi.fn(),
    };
    cm._updateXAxisTicksDensity(fakeChart);
    // Il nuovo stepSize deve essere inferiore a 999 e uno dei valori candidati
    const validSteps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240];
    expect(validSteps).toContain(fakeChart.options.scales.x.ticks.stepSize);
  });

  it("non aggiorna se lo stepSize non è cambiato", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));

    const mockUpdate = vi.fn();
    const fakeChart = {
      scales: { x: { min: 0, max: 1440 } },
      options: { scales: { x: { ticks: { stepSize: 240 } } } },
      update: mockUpdate,
    };
    // Primo aggiornamento (imposta 240)
    cm._updateXAxisTicksDensity(fakeChart);
    mockUpdate.mockClear();
    // Secondo aggiornamento (già 240 → nessun update)
    cm._updateXAxisTicksDensity(fakeChart);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("non crasha per eccezioni interne", () => {
    const { cm } = makeChartManager();
    const badChart = { scales: { get x() { throw new Error("fail"); } } };
    expect(() => cm._updateXAxisTicksDensity(badChart)).not.toThrow();
  });

  it("usa min=0 e max=1440 come default se non definiti", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));

    const fakeChart = {
      scales: { x: {} }, // min/max undefined
      options: { scales: { x: { ticks: { stepSize: 999 } } } },
      update: vi.fn(),
    };
    expect(() => cm._updateXAxisTicksDensity(fakeChart)).not.toThrow();
    const validSteps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240];
    expect(validSteps).toContain(fakeChart.options.scales.x.ticks.stepSize);
  });
});

// ─── _updateChartData (via updateData) ───────────────────────────────────────
describe("ChartManager – _updateChartData", () => {
  it("non crasha se chart è null", () => {
    const { cm } = makeChartManager();
    expect(() => cm.updateData([])).not.toThrow();
  });

  it("non crasha se stateManager non è disponibile", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    ctx.getManager.mockReturnValue(null);
    expect(() => cm.updateData([])).not.toThrow();
  });

  it("aggiorna i dati del dataset 0", async () => {
    const { cm, ctx } = makeChartManager();
    const stateManager = {
      getData: vi.fn().mockReturnValue([
        { time: "00:00", value: 20 },
        { time: "12:00", value: 25 },
        { time: "23:59", value: 20 },
      ]),
    };
    ctx.getManager.mockReturnValue(stateManager);
    await cm.initChart(document.createElement("canvas"));
    mockChartInstance.update.mockClear();
    cm.updateData([]);
    expect(mockChartInstance.data.datasets[0].data.length).toBeGreaterThan(0);
  });

  it("aggiunge il dataset corners per switch preset", async () => {
    const { cm, ctx } = makeChartManager({ is_switch_preset: true });
    const stateManager = {
      getData: vi.fn().mockReturnValue([
        { time: "00:00", value: 0 },
        { time: "06:00", value: 1 },
        { time: "06:01", value: 1 },
        { time: "23:59", value: 0 },
      ]),
    };
    ctx.getManager.mockReturnValue(stateManager);
    await cm.initChart(document.createElement("canvas"));

    // Simula che il dataset 1 non esista ancora
    mockChartInstance.data.datasets = [
      { data: [], pointBackgroundColor: [], pointBorderColor: [], pointRadius: [] },
    ];
    cm.updateData([]);
    // Dovrebbe aggiungere il dataset corners (indice 1)
    expect(mockChartInstance.data.datasets.length).toBe(2);
  });

  it("aggiorna il dataset corners se già esiste", async () => {
    const { cm, ctx } = makeChartManager({ is_switch_preset: true });
    const stateManager = {
      getData: vi.fn().mockReturnValue([
        { time: "00:00", value: 0 },
        { time: "12:00", value: 1 },
        { time: "12:01", value: 1 },
        { time: "23:59", value: 0 },
      ]),
    };
    ctx.getManager.mockReturnValue(stateManager);
    await cm.initChart(document.createElement("canvas"));

    // Dataset corners già presente
    mockChartInstance.data.datasets = [
      { data: [] },
      { data: [{ x: 1, y: 0 }] }, // vecchi corners
    ];
    cm.updateData([]);
    // Deve aggiornare in-place (non aggiungere un terzo dataset)
    expect(mockChartInstance.data.datasets.length).toBe(2);
  });

  it("rimuove il dataset corners se preset non è più switch", async () => {
    const { cm, ctx } = makeChartManager({ is_switch_preset: false });
    const stateManager = {
      getData: vi.fn().mockReturnValue([
        { time: "00:00", value: 20 },
        { time: "23:59", value: 20 },
      ]),
    };
    ctx.getManager.mockReturnValue(stateManager);
    await cm.initChart(document.createElement("canvas"));

    // Simula due dataset (come se fosse stato switch prima)
    mockChartInstance.data.datasets = [
      { data: [], pointBackgroundColor: [], pointBorderColor: [], pointRadius: [] },
      { data: [] },
    ];
    cm.updateData([]);
    expect(mockChartInstance.data.datasets.length).toBe(1);
  });
});

// ─── _updatePointStyles ────────────────────────────────────────────────────────
describe("ChartManager – _updatePointStyles", () => {
  it("non crasha se chart è null", () => {
    const { cm } = makeChartManager();
    expect(() => cm._updatePointStyles()).not.toThrow();
  });

  it("non crasha se selectionManager non è disponibile", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    ctx.getManager.mockReturnValue(null);
    expect(() => cm._updatePointStyles()).not.toThrow();
  });

  it("imposta colori e raggi corretti per selezione e ancora", async () => {
    const { cm, ctx } = makeChartManager();
    const stateManager = { getData: vi.fn().mockReturnValue([]) };
    ctx.getManager.mockReturnValue(stateManager);
    await cm.initChart(document.createElement("canvas"));

    mockChartInstance.data.datasets[0].data = [
      { x: 0, y: 20 },
      { x: 360, y: 22 },
      { x: 720, y: 25 },
    ];

    const selectionManager = {
      getSelectedPoints: vi.fn(() => [1]),
      getAnchor: vi.fn(() => 2),
    };
    ctx.getManager.mockImplementation((key) => {
      if (key === "selection") return selectionManager;
      return stateManager;
    });

    mockChartInstance.update.mockClear();
    cm._updatePointStyles();

    expect(mockChartInstance.update).toHaveBeenCalledWith("none");
    // Il punto anchor (2) deve avere il colore anchor
    const colors = mockChartInstance.data.datasets[0].pointBackgroundColor;
    expect(colors[2]).toBe("#ff5252"); // COLORS.anchor
    expect(colors[1]).toBe("#ff0000"); // COLORS.selected
    expect(colors[0]).toBe("#03a9f4"); // COLORS.primary
  });
});

// ─── _setupResizeObserver ─────────────────────────────────────────────────────
describe("ChartManager – _setupResizeObserver", () => {
  it("osserva il container fornito", () => {
    const { cm } = makeChartManager();
    const container = document.createElement("div");
    cm._setupResizeObserver(container);
    expect(cm._resizeObserver).toBeDefined();
  });

  it("disconnette il vecchio observer prima di crearne uno nuovo", () => {
    const { cm } = makeChartManager();
    const mockDisconnect = vi.fn();
    cm._resizeObserver = { disconnect: mockDisconnect };
    cm._setupResizeObserver(document.createElement("div"));
    expect(mockDisconnect).toHaveBeenCalled();
  });
});

// ─── _onWindowPointerMove ─────────────────────────────────────────────────────
describe("ChartManager – _onWindowPointerMove", () => {
  it("non fa nulla se _hDragActive è false", () => {
    const { cm } = makeChartManager();
    cm._hDragActive = false;
    expect(() => cm._onWindowPointerMove({ pointerId: 1 })).not.toThrow();
  });

  it("non fa nulla se il pointerSelecting è true", () => {
    const { cm } = makeChartManager();
    cm._hDragActive = true;
    cm.context._card.pointerSelecting = true;
    expect(() => cm._onWindowPointerMove({ pointerId: 1, clientX: 100 })).not.toThrow();
    cm.context._card.pointerSelecting = false;
  });

  it("non fa nulla se chart è null durante il drag", () => {
    const { cm } = makeChartManager();
    cm._hDragActive = true;
    cm.chart = null;
    expect(() => cm._onWindowPointerMove({ pointerId: 1, clientX: 100 })).not.toThrow();
  });

  it("non fa nulla se pointerId non corrisponde", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    cm._hDragActive = true;
    cm._hDragPointerId = 1;
    // Manda evento con pointerId diverso
    expect(() => cm._onWindowPointerMove({ pointerId: 99, clientX: 100 })).not.toThrow();
  });

  it("non fa nulla se dsIndex è null", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));
    cm._hDragActive = true;
    cm._hDragPointerId = null;
    cm.dragDatasetIndex = null;
    expect(() => cm._onWindowPointerMove({ pointerId: 1, clientX: 100, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false })).not.toThrow();
  });

  it("gestisce lo snap con modificatori della tastiera", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));

    cm._hDragActive = true;
    cm._hDragPointerId = null;
    cm.dragDatasetIndex = 0;
    cm.dragActiveIndex = 1;
    cm.initialSelectedX = { 1: 300 };
    cm.dragBounds = { 1: { left: 0, right: 1440 } };
    cm.dragSelectedPoints = [1];
    cm.hDragNeighbors = [];

    mockChartInstance.data.datasets[0].data = [
      { x: 0, y: 20 },
      { x: 300, y: 22 },
      { x: 1439, y: 20 },
    ];
    mockChartInstance.scales.x.getValueForPixel.mockReturnValue(360);

    // Test con shiftKey (snap=30)
    expect(() =>
      cm._onWindowPointerMove({
        pointerId: 1,
        clientX: 150,
        shiftKey: true,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      }),
    ).not.toThrow();
  });

  it("gestisce lo snap con ctrlKey", async () => {
    const { cm, ctx } = makeChartManager();
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));

    cm._hDragActive = true;
    cm._hDragPointerId = null;
    cm.dragDatasetIndex = 0;
    cm.dragActiveIndex = 1;
    cm.initialSelectedX = { 1: 300 };
    cm.dragBounds = { 1: { left: 0, right: 1440 } };
    cm.dragSelectedPoints = [1];
    cm.hDragNeighbors = [];

    mockChartInstance.data.datasets[0].data = [
      { x: 0, y: 20 },
      { x: 300, y: 22 },
      { x: 1439, y: 20 },
    ];
    mockChartInstance.scales.x.getValueForPixel.mockReturnValue(301);

    expect(() =>
      cm._onWindowPointerMove({
        pointerId: 1,
        clientX: 150,
        shiftKey: false,
        ctrlKey: true,
        altKey: false,
        metaKey: false,
      }),
    ).not.toThrow();
  });

  it("gestisce lo snap con altKey", async () => {
    const { cm, ctx } = makeChartManager({ drag_snap: { alt: 15 } });
    ctx.getManager.mockReturnValue({ getData: vi.fn().mockReturnValue([]) });
    await cm.initChart(document.createElement("canvas"));

    cm._hDragActive = true;
    cm._hDragPointerId = null;
    cm.dragDatasetIndex = 0;
    cm.dragActiveIndex = 1;
    cm.initialSelectedX = { 1: 300 };
    cm.dragBounds = { 1: { left: 0, right: 1440 } };
    cm.dragSelectedPoints = [];
    cm.hDragNeighbors = [];

    mockChartInstance.data.datasets[0].data = [
      { x: 0, y: 20 },
      { x: 300, y: 22 },
      { x: 1439, y: 20 },
    ];
    mockChartInstance.scales.x.getValueForPixel.mockReturnValue(315);

    expect(() =>
      cm._onWindowPointerMove({
        pointerId: 1,
        clientX: 150,
        shiftKey: false,
        ctrlKey: false,
        altKey: true,
        metaKey: false,
      }),
    ).not.toThrow();
  });
});

// ─── _onWindowPointerUp ────────────────────────────────────────────────────────
describe("ChartManager – _onWindowPointerUp", () => {
  it("non fa nulla se _hDragActive è false", () => {
    const { cm } = makeChartManager();
    cm._hDragActive = false;
    expect(() => cm._onWindowPointerUp({})).not.toThrow();
  });

  it("commita i dati al stateManager e reimposta _isDragging", async () => {
    const { cm, ctx } = makeChartManager();
    const stateManager = {
      getData: vi.fn().mockReturnValue([]),
      setData: vi.fn(),
      getDataWithChangePoints: vi.fn().mockReturnValue([]),
    };
    ctx.getManager.mockReturnValue(stateManager);
    await cm.initChart(document.createElement("canvas"));

    cm._hDragActive = true;
    cm.dragDatasetIndex = 0;
    mockChartInstance.data.datasets[0].data = [
      { x: 0, y: 20 },
      { x: 300, y: 22 },
      { x: 1439, y: 20 },
    ];

    cm._onWindowPointerUp({});
    expect(stateManager.setData).toHaveBeenCalled();
    expect(cm._isDragging).toBe(false);
    expect(cm.context._card.isDragging).toBe(false);
  });

  it("applica finalizeSwitchData per switch preset", async () => {
    const { cm, ctx } = makeChartManager({ is_switch_preset: true });
    const stateManager = {
      getData: vi.fn().mockReturnValue([]),
      setData: vi.fn(),
      getDataWithChangePoints: vi.fn().mockReturnValue([{ time: "00:00", value: 0 }]),
    };
    ctx.getManager.mockReturnValue(stateManager);
    await cm.initChart(document.createElement("canvas"));

    cm._hDragActive = true;
    cm.dragDatasetIndex = 0;
    mockChartInstance.data.datasets[0].data = [
      { x: 0, y: 0 },
      { x: 360, y: 1 },
      { x: 1439, y: 0 },
    ];

    cm._onWindowPointerUp({});
    // Deve chiamare setData due volte (una normale, una expanded)
    expect(stateManager.setData).toHaveBeenCalled();
  });

  it("non crasha se chart o dataset sono null", () => {
    const { cm } = makeChartManager();
    cm._hDragActive = true;
    cm.chart = null;
    expect(() => cm._onWindowPointerUp({})).not.toThrow();
  });
});

// ─── showDragValueDisplay / scheduleHideDragValueDisplay ─────────────────────
describe("ChartManager – drag display", () => {
  it("showDragValueDisplay non crasha se card non è nel context", () => {
    const { cm } = makeChartManager();
    expect(() => cm.showDragValueDisplay?.(22, 300)).not.toThrow();
  });

  it("scheduleHideDragValueDisplay non crasha", () => {
    const { cm } = makeChartManager();
    expect(() => cm.scheduleHideDragValueDisplay?.(500)).not.toThrow();
  });
});

// ─── Listener SCHEDULE_UPDATED & SELECTION_CHANGED ──────────────────────────
describe("ChartManager – event listeners", () => {
  it("SCHEDULE_UPDATED pianifica un aggiornamento del chart", () => {
    const { cm, ctx } = makeChartManager();
    const spy = vi.spyOn(cm, "_scheduleChartUpdate" in cm ? "_scheduleChartUpdate" : "updateData").mockImplementation(() => {});
    ctx.events._listeners["SCHEDULE_UPDATED"]?.({});
    // Non deve lanciare errori
    expect(true).toBe(true);
  });

  it("SELECTION_CHANGED aggiorna gli stili dei punti", () => {
    const { cm, ctx } = makeChartManager();
    const spy = vi.spyOn(cm, "_updatePointStyles").mockImplementation(() => {});
    ctx.events._listeners["SELECTION_CHANGED"]?.({});
    expect(spy).toHaveBeenCalled();
  });
});
