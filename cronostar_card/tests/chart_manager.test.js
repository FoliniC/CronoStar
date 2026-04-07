// @vitest-environment happy-dom
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

vi.mock("../src/utils.js", async () => {
  const actual = await vi.importActual("../src/utils.js");
  return { 
    ...actual, 
    Logger: { log: vi.fn(), chart: vi.fn(), error: vi.fn(), warn: vi.fn() },
    timeToMinutes: (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    },
    minutesToTime: (m) => {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(Math.round(m % 60)).padStart(2, '0');
        return `${hh}:${mm}`;
    }
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
  });

  describe("Dragging Logic", () => {
    it("_onWindowPointerMove branches", () => {
      cm._hDragActive = false;
      cm._onWindowPointerMove({});
      expect(mockChartInstance.update).not.toHaveBeenCalled();

      cm._hDragActive = true;
      cm._hDragPointerId = 1;
      cm._onWindowPointerMove({ pointerId: 2 });
      expect(mockChartInstance.update).not.toHaveBeenCalled();

      cm.chart = null;
      cm._onWindowPointerMove({ pointerId: 1 });
      expect(mockChartInstance.update).not.toHaveBeenCalled();

      cm.chart = mockChartInstance;
      ctx._card.pointerSelecting = true;
      cm._onWindowPointerMove({ pointerId: 1 });
      expect(mockChartInstance.update).not.toHaveBeenCalled();

      ctx._card.pointerSelecting = false;
      cm.dragDatasetIndex = null;
      cm._onWindowPointerMove({ pointerId: 1 });
      expect(mockChartInstance.update).not.toHaveBeenCalled();
    });

    it("returns early for invalid drag state details", () => {
      cm._hDragActive = true;
      cm.chart = mockChartInstance;
      cm.dragDatasetIndex = 0;
      cm.dragActiveIndex = 1;

      mockChartInstance.data.datasets[0] = null;
      cm._onWindowPointerMove({ pointerId: null });
      expect(mockChartInstance.update).not.toHaveBeenCalled();

      mockChartInstance.data.datasets[0] = { data: [] };
      mockChartInstance.scales.x = null;
      cm._onWindowPointerMove({ pointerId: null });
      expect(mockChartInstance.update).not.toHaveBeenCalled();

      mockChartInstance.scales.x = {
        ...mockChartInstance.options.scales.x,
        getValueForPixel: vi.fn(() => Number.NaN),
      };
      cm._onWindowPointerMove({ pointerId: null });
      expect(mockChartInstance.update).not.toHaveBeenCalled();

      mockChartInstance.scales.x = {
        ...mockChartInstance.scales.x,
        getValueForPixel: vi.fn(() => 300),
        getPixelForValue: vi.fn(() => 100),
      };
      mockChartInstance.data.datasets[0] = {
        data: [{ x: 0, y: 0 }, { x: 300, y: 10 }, { x: 1439, y: 0 }],
      };
      cm.initialSelectedX = {};
      cm.dragBounds = {};
      cm.dragSelectedPoints = [];
      cm._onWindowPointerMove({ clientX: 300, pointerId: null });
      expect(mockChartInstance.update).toHaveBeenCalled();
    });

    it("handles snap minutes and boundary clamping", () => {
      cm._hDragActive = true;
      cm.chart = mockChartInstance;
      cm.dragDatasetIndex = 0;
      cm.dragActiveIndex = 1;
      cm.initialSelectedX = { 1: 300 };
      cm.dragBounds = { 1: { left: 0, right: 1440 } };
      mockChartInstance.data.datasets[0].data = [
        { x: 0, y: 0 },
        { x: 300, y: 10 },
        { x: 1439, y: 0 },
      ];

      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(305);
      cm._onWindowPointerMove({ clientX: 305, pointerId: null, shiftKey: true });

      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(1500);
      cm._onWindowPointerMove({ clientX: 1500, pointerId: null });
      expect(mockChartInstance.data.datasets[0].data[1].x).toBe(1439);
    });

    it("uses ctrl/meta and alt drag snapping branches", () => {
      cm._hDragActive = true;
      cm.chart = mockChartInstance;
      cm.dragDatasetIndex = 0;
      cm.dragActiveIndex = 1;
      cm.initialSelectedX = { 1: 300 };
      cm.dragBounds = { 1: { left: 0, right: 1440 } };
      mockChartInstance.data.datasets[0].data = [
        { x: 0, y: 0 },
        { x: 300, y: 10 },
        { x: 1439, y: 0 },
      ];

      ctx.config.drag_snap = { default: 5, ctrl: 1, alt: 15 };
      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(317);
      cm._onWindowPointerMove({ clientX: 317, pointerId: null, ctrlKey: true });

      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(331);
      cm._onWindowPointerMove({ clientX: 331, pointerId: null, altKey: true });

      expect(mockChartInstance.update).toHaveBeenCalledTimes(2);
    });

    it("exercises _onWindowPointerMove with is_switch_preset and neighbors", () => {
      ctx.config.is_switch_preset = true;
      cm._hDragActive = true;
      cm.chart = mockChartInstance;
      cm.dragDatasetIndex = 0;
      cm.dragActiveIndex = 1;
      cm.dragStartX = 300;
      cm.initialSelectedX = { 1: 300, 2: 301 };
      cm.dragBounds = {
        1: { left: 0, right: 1440 },
        2: { left: 0, right: 1440 },
      };
      cm.dragSelectedPoints = [1];
      cm.hDragNeighbors = [2];

      mockChartInstance.data.datasets[0].data = [
        { x: 0, y: 0 },
        { x: 300, y: 1 },
        { x: 301, y: 1 },
        { x: 1439, y: 0 },
      ];
      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(310);
      cm._onWindowPointerMove({ clientX: 310, pointerId: null });
      expect(mockChartInstance.update).toHaveBeenCalled();
    });

    it("_onWindowPointerUp handles inactive and normal branches", () => {
      cm._hDragActive = false;
      cm._onWindowPointerUp({});
      expect(ctx.getManager).not.toHaveBeenCalled();

      cm._hDragActive = true;
      cm.chart = mockChartInstance;
      const stateManager = { setData: vi.fn() };
      ctx.getManager.mockReturnValue(stateManager);
      mockChartInstance.data.datasets[0].data = [
        { x: 0, y: 1 },
        { x: 1439, y: 0 },
      ];

      cm._onWindowPointerUp({});
      expect(stateManager.setData).toHaveBeenCalled();
      expect(cm._hDragActive).toBe(false);
    });

    it("handles switch preset in _onWindowPointerUp", () => {
      cm._hDragActive = true;
      cm.chart = mockChartInstance;
      ctx.config.is_switch_preset = true;
      const stateManager = {
        setData: vi.fn(),
        getDataWithChangePoints: vi.fn(() => [{ time: "00:00", value: 1 }]),
      };
      ctx.getManager.mockReturnValue(stateManager);
      mockChartInstance.data.datasets[0].data = [{ x: 0, y: 1 }];

      cm._onWindowPointerUp({});
      expect(stateManager.getDataWithChangePoints).toHaveBeenCalled();
    });
  });

  describe("Zoom and Pan Callbacks", () => {
    it("exercises zoom and pan logic", async () => {
      const stateManager = { getData: vi.fn().mockReturnValue([]) };
      ctx.getManager.mockReturnValue(stateManager);
      await cm.initChart(document.createElement("canvas"));

      const options = cm._buildChartOptions();
      const zoom = options.plugins.zoom;

      cm.lastMousePosition = { x: 5, y: 5 };
      expect(zoom.pan.onPanStart()).toBe(true);

      cm._isDragging = true;
      expect(zoom.pan.onPanStart()).toBe(false);
      cm._isDragging = false;

      cm.lastMousePosition = { x: 100, y: 140 };
      expect(zoom.pan.mode()).toBe("y");
      cm.lastMousePosition = { x: 10, y: 50 };
      expect(zoom.pan.mode()).toBe("x");

      const fakeChart = {
        ...mockChartInstance,
        options: { scales: { x: { ticks: {} } } },
      };
      zoom.pan.onPan({ chart: fakeChart });
      zoom.pan.onPanComplete({ chart: fakeChart });

      expect(zoom.zoom.onZoomStart()).toBe(true);
      cm._isDragging = true;
      expect(zoom.zoom.onZoomStart()).toBe(false);
      cm._isDragging = false;

      cm.lastMousePosition = { x: 60, y: 50 };
      zoom.zoom.onZoom({ chart: fakeChart });
      expect(ctx._card.isExpandedH).toBe(true);

      cm.lastMousePosition = { x: 5, y: 120 };
      expect(zoom.zoom.mode()).toBe("x");
      cm.lastMousePosition = { x: 10, y: 50 };
      expect(zoom.zoom.mode()).toBe("y");
      cm.lastMousePosition = { x: 100, y: 50 };
      expect(zoom.zoom.mode()).toBe("xy");

      zoom.zoom.onZoomComplete({ chart: fakeChart });
    });

    it("suppresses zoom callback errors", async () => {
      const stateManager = { getData: vi.fn().mockReturnValue([]) };
      ctx.getManager.mockReturnValue(stateManager);
      await cm.initChart(document.createElement("canvas"));

      const options = cm._buildChartOptions();
      const zoom = options.plugins.zoom;

      cm.lastMousePosition = { x: 60, y: 50 };
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      zoom.zoom.onZoom({ chart: { scales: null } });
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe("DragData Plugin Callbacks", () => {
    it("exercises dragData logic", async () => {
      ctx.config.is_switch_preset = true;
      const selectionManager = {
        getSelectedPoints: vi.fn(() => [1]),
        getAnchor: vi.fn(() => 1),
      };
      const stateManager = {
        getData: vi.fn().mockReturnValue([]),
        setData: vi.fn(),
      };
      ctx.getManager.mockImplementation((k) =>
        k === "selection" ? selectionManager : stateManager,
      );

      await cm.initChart(document.createElement("canvas"));
      const options = cm._buildChartOptions();
      const dd = options.plugins.dragData;

      expect(dd.magnet.to(0.7)).toBe(1);
      expect(dd.magnet.to({ y: 0.3 })).toEqual({ y: 0 });

      mockChartInstance.data.datasets[0].data = [
        { x: 0, y: 0 },
        { x: 360, y: 1 },
        { x: 361, y: 1 },
        { x: 1439, y: 0 },
      ];
      dd.onDragStart({}, 0, 1, 1);
      dd.onDrag({}, 0, 1, 0.8);
      dd.onDragEnd({}, 0, 1, 1);
      expect(cm._isDragging).toBe(false);
    });

    it("covers non-switch dragData branches", async () => {
      ctx.config.is_switch_preset = false;
      ctx.config.min_value = 10;
      ctx.config.max_value = 20;
      ctx.config.step_value = 0.5;
      ctx.config.allow_max_value = true;

      const selectionManager = {
        getSelectedPoints: vi.fn(() => [1, 2]),
        getAnchor: vi.fn(() => 1),
      };
      const stateManager = {
        getData: vi.fn().mockReturnValue([]),
        setData: vi.fn(),
      };
      ctx.getManager.mockImplementation((k) =>
        k === "selection" ? selectionManager : stateManager,
      );

      await cm.initChart(document.createElement("canvas"));
      const dd = cm._buildChartOptions().plugins.dragData;

      expect(dd.magnet.to(1.7)).toBe(1.7);

      mockChartInstance.data.datasets[0].data = [
        { x: 0, y: 10 },
        { x: 360, y: 15 },
        { x: 720, y: 16 },
        { x: 1439, y: 20 },
      ];

      ctx._card.pointerSelecting = true;
      expect(dd.onDragStart({}, 0, 1, 15)).toBe(false);
      ctx._card.pointerSelecting = false;

      expect(dd.onDragStart({}, 0, 1, { y: 15 })).toBe(true);
      dd.onDrag({}, 0, 1, { y: 25 });
      expect(mockChartInstance.data.datasets[0].data[1].y).toBe(20.5);
      expect(mockChartInstance.data.datasets[0].data[2].y).toBe(20.5);

      dd.onDragEnd({}, 0, 1, { y: 20.5 });
      expect(stateManager.setData).toHaveBeenCalled();
    });
  });

  describe("Click Logic - _handleClick", () => {
    let selectionManager, stateManager;

    beforeEach(async () => {
      selectionManager = {
        selectPoint: vi.fn(),
        clearSelection: vi.fn(),
        getSelectedPoints: vi.fn(() => []),
        getAnchor: vi.fn(() => -1),
        selectRange: vi.fn(),
        togglePoint: vi.fn(),
      };
      stateManager = {
        getData: vi
          .fn()
          .mockReturnValue([
            { time: "00:00", value: 20 },
            { time: "23:59", value: 20 },
          ]),
        alignSelectedPoints: vi.fn(),
        insertPoint: vi.fn().mockReturnValue(1),
      };
      ctx.getManager.mockImplementation((k) =>
        k === "selection" ? selectionManager : stateManager,
      );
      await cm.initChart(document.createElement("canvas"));
    });

    it("returns early when click is suppressed or managers are missing", () => {
      ctx._card.suppressClickUntil = Date.now() + 1000;
      cm._handleClick({ native: {} }, []);
      expect(selectionManager.selectPoint).not.toHaveBeenCalled();

      ctx._card.suppressClickUntil = 0;
      ctx.getManager.mockImplementation(() => null);
      cm._handleClick({ native: {} }, []);
      expect(selectionManager.selectPoint).not.toHaveBeenCalled();
    });

    it("handles alt-click for alignment", async () => {
      const event = {
        native: {
          altKey: true,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      };
      cm._handleClick(event, []);
      expect(stateManager.alignSelectedPoints).toHaveBeenCalled();
    });

    it("clears selection if click outside chart area", async () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
      mockChartInstance.scales.x.left = 50;
      cm._getCanvasRelativePosition = () => ({ x: 10, y: 10 });
      cm._handleClick({ native: {} }, []);
      expect(selectionManager.clearSelection).toHaveBeenCalled();
    });

    it("handles click near existing point to select it", async () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([
        { datasetIndex: 0, index: 1 },
      ]);
      mockChartInstance.getDatasetMeta.mockReturnValue({
        data: [{ x: 50, y: 50 }, { x: 150, y: 100 }],
      });
      cm._getCanvasRelativePosition = () => ({ x: 155, y: 105 });

      cm._handleClick({ native: {} }, []);
      expect(selectionManager.selectPoint).toHaveBeenCalledWith(1);
    });

    it("handles shift/meta point selection branches", () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([
        { datasetIndex: 0, index: 1 },
      ]);
      mockChartInstance.getDatasetMeta.mockReturnValue({
        data: [{ x: 50, y: 50 }, { x: 150, y: 100 }],
      });
      cm._getCanvasRelativePosition = () => ({ x: 150, y: 100 });

      cm._handleClick({ native: { shiftKey: true } }, []);
      expect(selectionManager.selectRange).toHaveBeenCalledWith(1);

      cm._handleClick({ native: { ctrlKey: true } }, []);
      expect(selectionManager.togglePoint).toHaveBeenCalledWith(1);

      cm._handleClick({ native: { metaKey: true } }, []);
      expect(selectionManager.togglePoint).toHaveBeenCalledWith(1);
    });

    it("selects nearest milestone instead of inserting when within threshold", () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
      mockChartInstance.scales.x.left = 0;
      mockChartInstance.scales.x.right = 300;
      mockChartInstance.scales.y.top = 0;
      mockChartInstance.scales.y.bottom = 150;
      mockChartInstance.scales.x.min = 0;
      mockChartInstance.scales.x.max = 1440;
      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(5);
      cm._getCanvasRelativePosition = () => ({ x: 100, y: 30 });

      cm._handleClick({ native: {} }, []);
      expect(selectionManager.selectPoint).toHaveBeenCalledWith(0);
      expect(stateManager.insertPoint).not.toHaveBeenCalled();
    });

    it("inserts a new non-switch point when clicking near the line", () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
      mockChartInstance.scales.x.left = 0;
      mockChartInstance.scales.x.right = 300;
      mockChartInstance.scales.y.top = 0;
      mockChartInstance.scales.y.bottom = 150;
      mockChartInstance.scales.x.min = 0;
      mockChartInstance.scales.x.max = 180;
      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(600);
      mockChartInstance.scales.y.getValueForPixel.mockReturnValue(12.7);
      mockChartInstance.scales.y.getPixelForValue.mockReturnValue(50);
      stateManager.getData.mockReturnValue([
        { time: "00:00", value: 10 },
        { time: "23:59", value: 20 },
      ]);
      cm._getCanvasRelativePosition = () => ({ x: 120, y: 60 });

      cm._handleClick({ native: {} }, []);
      expect(stateManager.insertPoint).toHaveBeenCalledWith("10:00", 12.5);
      expect(selectionManager.selectPoint).toHaveBeenCalledWith(1);
    });

    it("clears selection when click is not near the interpolated line", () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
      mockChartInstance.scales.x.left = 0;
      mockChartInstance.scales.x.right = 300;
      mockChartInstance.scales.y.top = 0;
      mockChartInstance.scales.y.bottom = 150;
      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(600);
      mockChartInstance.scales.y.getPixelForValue.mockReturnValue(10);
      stateManager.getData.mockReturnValue([
        { time: "00:00", value: 10 },
        { time: "23:59", value: 20 },
      ]);
      cm._getCanvasRelativePosition = () => ({ x: 120, y: 100 });

      cm._handleClick({ native: {} }, []);
      expect(selectionManager.clearSelection).toHaveBeenCalled();
    });

    it("handles switch preset insertion and paired-neighbor logging branch", () => {
      ctx.config.is_switch_preset = true;
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
      mockChartInstance.scales.x.left = 0;
      mockChartInstance.scales.x.right = 300;
      mockChartInstance.scales.y.top = 0;
      mockChartInstance.scales.y.bottom = 150;
      mockChartInstance.scales.x.min = 0;
      mockChartInstance.scales.x.max = 1440;
      mockChartInstance.scales.x.getValueForPixel
        .mockReturnValueOnce(600)
        .mockReturnValueOnce(602);
      mockChartInstance.scales.y.getValueForPixel.mockReturnValue(0.8);

      stateManager.getData
        .mockReturnValueOnce([
          { time: "10:00", value: 0 },
          { time: "10:01", value: 1 },
          { time: "23:59", value: 1 },
        ])
        .mockReturnValueOnce([
          { time: "00:00", value: 0 },
          { time: "23:59", value: 1 },
        ]);

      cm._getCanvasRelativePosition = () => ({ x: 120, y: 60 });
      cm._handleClick({ native: {} }, []);
      expect(selectionManager.selectPoint).toHaveBeenCalledWith(0);

      cm._handleClick({ native: {} }, []);
      expect(stateManager.insertPoint).toHaveBeenCalledWith("10:02", 1);
    });
  });

  describe("Interpolation and Data Updates", () => {
    it("handles null/edge interpolation branches", () => {
      cm.chart = null;
      expect(cm._interpolateValueAtMinutes(50)).toBeNull();

      cm.chart = mockChartInstance;
      mockChartInstance.data.datasets[0].data = [];
      expect(cm._interpolateValueAtMinutes(50)).toBeNull();

      mockChartInstance.data.datasets[0].data = [
        { x: 100, y: 10 },
        { x: 200, y: 20 },
      ];

      expect(cm._interpolateValueAtMinutes(50)).toBe(10);
      expect(cm._interpolateValueAtMinutes(250)).toBe(20);
      expect(cm._interpolateValueAtMinutes(300)).toBe(20);

      ctx.config.is_switch_preset = true;
      expect(cm._interpolateValueAtMinutes(150)).toBe(10);
    });

    it("builds chart data and localized labels", () => {
      const built = cm._buildChartData([
        { time: "00:00", value: 0 },
        { time: "10:00", value: 1 },
      ]);
      expect(built.datasets).toHaveLength(1);

      ctx.config.is_switch_preset = true;
      const switchBuilt = cm._buildChartData([
        { time: "00:00", value: 0 },
        { time: "10:00", value: 1 },
      ]);
      expect(switchBuilt.datasets).toHaveLength(2);

      expect(cm._getLocalizedLabel("Time")).toBe("ui.time_label");
      expect(cm._getLocalizedLabel("Temperature")).toBe("ui.temperature_label");
      expect(cm._getLocalizedLabel("Power")).toBe("ui.power_label");
      expect(cm._getLocalizedLabel("Energy")).toBe("ui.energy_label");
      expect(cm._getLocalizedLabel("State")).toBe("ui.state_label");
      expect(cm._getLocalizedLabel("Position")).toBe("ui.position_label");
      expect(cm._getLocalizedLabel("Value")).toBe("ui.value_label");
      expect(cm._getLocalizedLabel("Custom")).toBe("Custom");
    });

    it("builds chart options callbacks and updates chart data datasets", () => {
      cm.chart = mockChartInstance;
      const options = cm._buildChartOptions();

      options.onHover(
        { chart: mockChartInstance, native: { clientX: 100, clientY: 120 } },
        [],
      );
      expect(mockChartInstance.canvas.style.cursor).toBe("zoom-in");

      cm._getCanvasRelativePosition = () => ({ x: 100, y: 50 });
      options.onHover(
        { chart: mockChartInstance, native: { clientX: 100, clientY: 50 } },
        [{ index: 0 }],
      );
      expect(mockChartInstance.canvas.style.cursor).toBe("pointer");

      cm._getCanvasRelativePosition = () => ({ x: 100, y: 50 });
      options.onHover(
        { chart: mockChartInstance, native: { clientX: 100, clientY: 50 } },
        [],
      );
      expect(mockChartInstance.canvas.style.cursor).toBe("crosshair");

      expect(options.scales.x.ticks.callback(1439)).toBe("23:59");
      expect(options.scales.y.ticks.callback(12)).toContain("12.0");

      ctx.config.is_switch_preset = true;
      const switchOptions = cm._buildChartOptions();
      expect(switchOptions.scales.y.ticks.callback(0)).toBe("off (0)");
      expect(switchOptions.scales.y.ticks.callback(1)).toBe("on (1)");
      expect(switchOptions.scales.y.ticks.callback(0.5)).toBe("");
    });

    it("updates corner dataset for switch preset and removes it otherwise", () => {
      ctx.config.is_switch_preset = true;
      const stateManager = {
        getData: vi.fn(() => [
          { time: "00:00", value: 0 },
          { time: "10:00", value: 1 },
        ]),
      };
      ctx.getManager.mockReturnValue(stateManager);
      cm.chart = mockChartInstance;
      mockChartInstance.data.datasets = [{ data: [] }, { data: [], label: "Corners" }];
      cm.updateData([]);
      expect(mockChartInstance.data.datasets[1].data.length).toBeGreaterThan(0);

      ctx.config.is_switch_preset = false;
      mockChartInstance.data.datasets = [{ data: [] }, { data: [{ x: 1, y: 1 }] }];
      cm.updateData([]);
      expect(mockChartInstance.data.datasets).toHaveLength(1);
    });

    it("schedules chart updates and updates tick density", () => {
      const updateSpy = vi.spyOn(cm, "_updateChartData").mockImplementation(() => {});
      cm._scheduleChartUpdate();
      vi.runAllTimers();
      expect(updateSpy).toHaveBeenCalled();

      cm.chart = mockChartInstance;
      mockChartInstance.options.scales.x.ticks = { stepSize: 60 };
      mockChartInstance.scales.x.min = 0;
      mockChartInstance.scales.x.max = 100;
      cm._updateXAxisTicksDensity(mockChartInstance);
      expect(mockChartInstance.options.scales.x.ticks.stepSize).toBe(15);

      cm._updateXAxisTicksDensity({ scales: null });
    });
  });

  describe("Lifecycle and Cleanup", () => {
    it("destroy cleans up correctly", () => {
      const observer = { disconnect: vi.fn() };
      cm._resizeObserver = observer;
      cm.chart = mockChartInstance;
      cm.destroy();
      expect(mockChartInstance.destroy).toHaveBeenCalled();
      expect(observer.disconnect).toHaveBeenCalled();
    });

    it("destroy removes hover listeners when handlers exist", () => {
      cm.chart = mockChartInstance;
      const hoverHandler = vi.fn();
      const hoverOutHandler = vi.fn();
      cm._hoverHandler = hoverHandler;
      cm._hoverOutHandler = hoverOutHandler;
      cm.destroy();
      expect(mockChartInstance.canvas.removeEventListener).toHaveBeenCalledWith(
        "pointermove",
        hoverHandler,
      );
      expect(mockChartInstance.canvas.removeEventListener).toHaveBeenCalledWith(
        "pointerout",
        hoverOutHandler,
      );
    });

    it("resize observer callback triggers chart resize", () => {
      cm.chart = mockChartInstance;
      cm._setupResizeObserver({});

      resizeObserverCallback();

      expect(mockChartInstance.resize).toHaveBeenCalled();
      expect(resizeObserverInstance.observe).toHaveBeenCalled();
    });

    it("exercises other small methods", () => {
      cm._initialized = true;
      cm.chart = { update: vi.fn() };
      expect(cm.isInitialized()).toBe(true);
      expect(cm.getChart()).toBe(cm.chart);
      cm.updateChartLabels();
      cm.recreateChartOptions();
      cm.update("none");
      expect(cm.chart.update).toHaveBeenCalled();
      cm.updatePointStyling();
      cm.updateData([]);
    });

    it("updates point styles and area helpers", () => {
      const selectionManager = {
        getSelectedPoints: vi.fn(() => [1]),
        getAnchor: vi.fn(() => 0),
      };
      ctx.getManager.mockReturnValue(selectionManager);
      cm.chart = mockChartInstance;
      mockChartInstance.data.datasets[0] = { data: [{}, {}, {}] };

      cm._updatePointStyles();
      expect(mockChartInstance.data.datasets[0].pointRadius).toEqual([8, 8, 6]);

      mockChartInstance.getDatasetMeta.mockReturnValue({
        data: [{ x: 5, y: 5 }, { x: 15, y: 15 }],
      });
      expect(cm.getIndicesInArea(0, 0, 10, 10)).toEqual([0]);
    });

    it("deletePointAtEvent handles success and failure", () => {
      const stateManager = { removePoint: vi.fn() };
      ctx.getManager.mockReturnValue(stateManager);
      cm.chart = mockChartInstance;
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([
        { datasetIndex: 0, index: 1 },
      ]);
      expect(cm.deletePointAtEvent({})).toBe(true);
      expect(stateManager.removePoint).toHaveBeenCalledWith(1);

      mockChartInstance.getElementsAtEventForMode.mockReturnValue([
        { datasetIndex: 1, index: 0 },
      ]);
      expect(cm.deletePointAtEvent({})).toBe(false);

      cm.chart = null;
      expect(cm.deletePointAtEvent({})).toBe(false);
    });
  });

  describe("UI Helpers", () => {
    it("exercises _showHoverInfo branches", async () => {
      const stateManager = {
        getData: vi
          .fn()
          .mockReturnValue([
            { time: "00:00", value: 20 },
            { time: "23:59", value: 20 },
          ]),
      };
      ctx.getManager.mockReturnValue(stateManager);
      await cm.initChart(document.createElement("canvas"));

      cm._isDragging = true;
      cm._showHoverInfo({});
      cm._isDragging = false;

      cm._getCanvasRelativePosition = () => ({ x: -10, y: -10 });
      cm._showHoverInfo({});

      cm._interpolateValueAtMinutes = vi.fn(() => null);
      cm._getCanvasRelativePosition = () => ({ x: 150, y: 75 });
      cm._showHoverInfo({});

      cm._interpolateValueAtMinutes = vi.fn(() => 20);
      ctx.config.unit_of_measurement = "°C";
      cm._showHoverInfo({});
    });

    it("handles hover hide, drag display, and touch position helpers", () => {
      cm._hideHoverInfo();

      cm.chart = mockChartInstance;
      mockChartInstance.scales.x.getPixelForValue.mockReturnValue(280);
      cm.showDragValueDisplay(20, 1400);
      expect(
        ctx._card.shadowRoot.getElementById("drag-value-display").style.left,
      ).toBeDefined();

      ctx.config.is_switch_preset = true;
      mockChartInstance.scales.x.getPixelForValue.mockReturnValue(50);
      cm.showDragValueDisplay(1, 60);

      cm.scheduleHideDragValueDisplay(1);
      vi.runAllTimers();

      cm.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
      const e = { touches: [{ clientX: 100, clientY: 200 }] };
      expect(cm._getCanvasRelativePosition(e)).toEqual({ x: 100, y: 200 });

      const e2 = { changedTouches: [{ clientX: 50, clientY: 60 }] };
      expect(cm._getCanvasRelativePosition(e2)).toEqual({ x: 50, y: 60 });

      const e3 = { native: { clientX: 5, clientY: 6 } };
      expect(cm._getCanvasRelativePosition(e3)).toEqual({ x: 5, y: 6 });

      cm.canvas = null;
      expect(cm._getCanvasRelativePosition({ clientX: 1, clientY: 2 })).toEqual({
        x: 0,
        y: 0,
      });
    });

    it("ignores display helpers safely when prerequisites are missing", () => {
      cm.chart = null;
      cm.showDragValueDisplay(1, 1);

      cm.chart = mockChartInstance;
      mockChartInstance.canvas.isConnected = false;
      cm.showDragValueDisplay(1, 1);
      cm._showHoverInfo({});
    });
  });
});
