// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function createTestDocument() {
  const createElement = (tagName) => {
    const element = {
      tagName: String(tagName || "").toUpperCase(),
      style: {},
      children: [],
      parentElement: null,
      isConnected: true,
      appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({
        left: 0,
        top: 0,
        width: 300,
        height: 150,
      })),
    };
    return element;
  };

  return {
    createElement,
    head: { innerHTML: "" },
  };
}

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.window.addEventListener) globalThis.window.addEventListener = vi.fn();
if (!globalThis.window.removeEventListener) globalThis.window.removeEventListener = vi.fn();
if (!globalThis.document) {
  globalThis.document = createTestDocument();
} else {
  if (!globalThis.document.createElement) globalThis.document.createElement = createTestDocument().createElement;
  if (!globalThis.document.head) globalThis.document.head = { innerHTML: "" };
}
if (!globalThis.customElements) {
  const registry = new Map();
  globalThis.customElements = {
    define: vi.fn((name, ctor) => registry.set(name, ctor)),
    get: vi.fn((name) => registry.get(name)),
  };
}
globalThis.window.customElements = globalThis.customElements;

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
      {
        data: [], // Corners dataset
      }
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
      y: {
        ticks: { stepSize: 1 }
      },
    },
    plugins: {
      zoom: {
        pan: { onPanStart: null, mode: null, onPan: null, onPanComplete: null },
        zoom: { onZoomStart: null, mode: null, onZoom: null, onZoomComplete: null }
      },
      dragData: { onDragStart: null, onDrag: null, onDragEnd: null, magnet: { to: null } }
    }
  },
  scales: {
    x: {
      min: 0,
      max: 1440,
      left: 0,
      right: 300,
      top: 100,
      bottom: 150,
      ticks: { stepSize: 60, includeBounds: false },
      getValueForPixel: vi.fn(() => 300),
      getPixelForValue: vi.fn(() => 100),
    },
    y: {
      min: 0,
      max: 30,
      top: 0,
      bottom: 150,
      left: 0,
      right: 50,
      getValueForPixel: vi.fn(() => 20),
      getPixelForValue: vi.fn(() => 50),
    }
  },
  canvas: {
    getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 300, height: 150 })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    style: {},
    isConnected: true,
    parentElement: {
      appendChild: vi.fn(),
      addEventListener: vi.fn()
    }
  },
  update: vi.fn(),
  resize: vi.fn(),
  destroy: vi.fn(),
  getDatasetMeta: vi.fn(() => ({ data: [] })),
  getElementsAtEventForMode: vi.fn(() => []),
};

vi.mock("chart.js/auto", () => {
  class MockChart {
    constructor() {
      return mockChartInstance;
    }
    static register = vi.fn();
  }
  return { 
    default: MockChart,
    Chart: MockChart
  };
});

vi.mock("chartjs-plugin-dragdata", () => ({ default: {} }));
vi.mock("chartjs-plugin-zoom", () => ({ default: {} }));

vi.mock("../src/utils.js", () => {
  if (!globalThis.window) globalThis.window = globalThis;
  return {
    Logger: { log: vi.fn(), chart: vi.fn(), error: vi.fn(), warn: vi.fn() },
    timeToMinutes: (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    },
    minutesToTime: (m) => {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(Math.round(m % 60)).padStart(2, "0");
      return `${hh}:${mm}`;
    },
  };
});

vi.mock("../src/core/EventBus.js", () => ({
  Events: {
    SCHEDULE_UPDATED: "SCHEDULE_UPDATED",
    SELECTION_CHANGED: "SELECTION_CHANGED",
    CHART_DESTROYED: "CHART_DESTROYED",
    CHART_READY: "CHART_READY",
  },
}));

vi.mock("../src/config.js", () => ({
  COLORS: {
    primary: "#03a9f4",
    selected: "#ff0000",
    anchor: "#ff5252",
    accent: "#ff9800",
    primaryLight: "rgba(3, 169, 244, 0.1)"
  },
}));

import { ChartManager } from "../src/managers/chart_manager.js";

function makeContext(configOverrides = {}) {
  const listeners = {};
  return {
    config: {
      is_switch_preset: false,
      drag_snap: {},
      ...configOverrides,
    },
    language: "en",
    events: {
      on: vi.fn((evt, fn) => { listeners[evt] = fn; }),
      emit: vi.fn(),
      _listeners: listeners,
    },
    getManager: vi.fn(),
    requestUpdate: vi.fn(),
    _card: {
      isDragging: false,
      pointerSelecting: false,
      localizationManager: {
        localize: vi.fn((lang, key) => key),
      },
      shadowRoot: {
        getElementById: vi.fn((id) => {
            if (id === 'hover-value-display' || id === 'drag-value-display') {
                return { style: { display: 'none', left: '', top: '' }, textContent: "" };
            }
            return null;
        }),
        querySelector: vi.fn((sel) => {
            if (sel === '.chart-container') {
                return { getBoundingClientRect: () => ({ width: 300, left: 0, top: 0 }) };
            }
            return null;
        })
      }
    },
  };
}

describe("ChartManager - Comprehensive Coverage", () => {
  let cm, ctx;
  let resizeObserverInstance;
  let resizeObserverCallback;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.addEventListener = vi.fn();
    window.removeEventListener = vi.fn();
    resizeObserverCallback = null;
    resizeObserverInstance = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        constructor(callback) {
          resizeObserverCallback = callback;
          return resizeObserverInstance;
        }
      },
    );
    vi.stubGlobal("requestAnimationFrame", vi.fn((cb) => cb()));
    ctx = makeContext();
    cm = new ChartManager(ctx);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("Constructor and Init", () => {
    it("constructor sets up state", () => {
        expect(cm.isInitialized()).toBe(false);
        expect(ctx.events.on).toHaveBeenCalledTimes(2);
    });

    it("initChart handles success and failure", async () => {
        expect(await cm.initChart(null)).toBe(false);
        ctx.getManager.mockReturnValue(null);
        expect(await cm.initChart({})).toBe(false);

        const stateManager = { getData: vi.fn(() => []) };
        ctx.getManager.mockReturnValue(stateManager);
        const canvas = document.createElement('canvas');
        vi.spyOn(canvas, 'addEventListener');
        expect(await cm.initChart(canvas)).toBe(true);
        expect(canvas.addEventListener).toHaveBeenCalled();
    });

    it("initChart destroys existing chart before re-init", async () => {
      const stateManager = { getData: vi.fn(() => []) };
      ctx.getManager.mockReturnValue(stateManager);

      const canvasA = document.createElement("canvas");
      await cm.initChart(canvasA);

      const previousChart = cm.chart;
      const destroySpy = vi.spyOn(previousChart, "destroy");

      const canvasB = document.createElement("canvas");
      await cm.initChart(canvasB);

      expect(destroySpy).toHaveBeenCalled();
    });

    it("pointerdown handles edge cases", async () => {
        const stateManager = { getData: vi.fn(() => []) };
        const selectionManager = {
          isSelected: vi.fn(() => false),
          selectPoint: vi.fn(),
          getSelectedPoints: vi.fn(() => [1]),
          getAnchor: vi.fn(() => 1),
        };
        ctx.getManager.mockImplementation((k) => k === "state" ? stateManager : selectionManager);
        const canvas = document.createElement("canvas");
        vi.spyOn(canvas, "addEventListener");
        await cm.initChart(canvas);

        const pointerDownHandler = canvas.addEventListener.mock.calls.find(c => c[0] === "pointerdown")[1];

        pointerDownHandler({ button: 1 });

        mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
        pointerDownHandler({ button: 0 });

        mockChartInstance.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 1 }]);
        mockChartInstance.data.datasets[0].data = [{ x: 0, y: 0 }, { x: 300, y: 10 }, { x: 1439, y: 0 }];
        pointerDownHandler({ button: 0, pointerId: 1 });
        expect(selectionManager.selectPoint).toHaveBeenCalledWith(1);
    });

    it("pointerdown skips selection when already selected and collects switch neighbors", async () => {
        ctx.config.is_switch_preset = true;
        const stateManager = { getData: vi.fn(() => []) };
        const selectionManager = {
          isSelected: vi.fn(() => true),
          selectPoint: vi.fn(),
          getSelectedPoints: vi.fn(() => [1]),
          getAnchor: vi.fn(() => 1),
        };
        ctx.getManager.mockImplementation((k) => k === "state" ? stateManager : selectionManager);
        const canvas = document.createElement("canvas");
        vi.spyOn(canvas, "addEventListener");
        await cm.initChart(canvas);

        const pointerDownHandler = canvas.addEventListener.mock.calls.find(c => c[0] === "pointerdown")[1];

        mockChartInstance.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 1 }]);
        mockChartInstance.data.datasets[0].data = [
          { x: 0, y: 0 },
          { x: 300, y: 1 },
          { x: 301, y: 0 },
          { x: 1439, y: 0 },
        ];

        pointerDownHandler({ button: 0, pointerId: 11 });

        expect(selectionManager.selectPoint).not.toHaveBeenCalled();
        expect(cm.hDragNeighbors).toEqual([2]);
        expect(cm._hDragActive).toBe(true);
    });

    it("pointermove and pointerout listeners update hover state", async () => {
        const stateManager = { getData: vi.fn(() => []) };
        ctx.getManager.mockReturnValue(stateManager);
        const canvas = document.createElement("canvas");
        vi.spyOn(canvas, "addEventListener");
        const hoverSpy = vi.spyOn(cm, "_showHoverInfo");
        const hideSpy = vi.spyOn(cm, "_hideHoverInfo");

        await cm.initChart(canvas);

        const pointerMoveHandler = canvas.addEventListener.mock.calls.find(c => c[0] === "pointermove")[1];
        const pointerOutHandler = canvas.addEventListener.mock.calls.find(c => c[0] === "pointerout")[1];

        pointerMoveHandler({ clientX: 25, clientY: 30 });
        expect(cm.lastMousePosition).toEqual({ x: 25, y: 30 });
        expect(hoverSpy).toHaveBeenCalled();

        pointerOutHandler();
        expect(hideSpy).toHaveBeenCalled();
    });

    it("currentTimeIndicator plugin afterDatasetsDraw executes drawing branch", () => {
      const plugin = {
        afterDatasetsDraw: (chart) => {
          const { ctx, chartArea, scales } = chart;
          if (!ctx || !chartArea || !scales?.x) return;
          const xPos = scales.x.getPixelForValue(600);
          if (xPos < chartArea.left || xPos > chartArea.right) return;
          ctx.save();
          ctx.beginPath();
          ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
          ctx.clip();
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255, 82, 82, 0.6)";
          ctx.beginPath();
          ctx.moveTo(xPos, chartArea.top);
          ctx.lineTo(xPos, chartArea.bottom);
          ctx.stroke();
          ctx.restore();
        },
      };

      const fakeCtx = {
        save: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        setLineDash: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        restore: vi.fn(),
        lineWidth: 0,
        strokeStyle: "",
      };

      const fakeChart = {
        ctx: fakeCtx,
        chartArea: { left: 0, right: 300, top: 0, bottom: 150 },
        scales: { x: { getPixelForValue: vi.fn(() => 120) } },
      };

      plugin.afterDatasetsDraw(fakeChart);
      expect(fakeCtx.save).toHaveBeenCalled();
      expect(fakeCtx.stroke).toHaveBeenCalled();
      expect(fakeCtx.restore).toHaveBeenCalled();
    });
  });
});
