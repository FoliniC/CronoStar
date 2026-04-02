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
      top: 100, // Added for pan/zoom logic
      bottom: 150, // Added for pan/zoom logic
      ticks: { stepSize: 60, includeBounds: false },
      getValueForPixel: vi.fn(() => 300),
      getPixelForValue: vi.fn(() => 100),
    },
    y: {
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
      appendChild: vi.fn()
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
  return { ...actual, Logger: { log: vi.fn(), chart: vi.fn(), error: vi.fn() } };
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

// ─── Factory: context minimale ────────────────────────────────────────────────
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
        getElementById: vi.fn(() => ({ style: {}, textContent: "" })),
        querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ width: 300 }) }))
      }
    },
    _listeners: listeners,
  };
}

function makeChartManager(configOverrides = {}) {
  const ctx = makeContext(configOverrides);
  const cm = new ChartManager(ctx);
  return { cm, ctx };
}

describe("ChartManager - Final Coverage Boost", () => {
  let cm, ctx;

  beforeEach(() => {
    vi.clearAllMocks();
    const res = makeChartManager();
    cm = res.cm;
    ctx = res.ctx;
  });

  describe("Dragging Logic - _onWindowPointerMove Advanced", () => {
    it("handles boundary clamping and neighbors", async () => {
      const stateManager = { getData: vi.fn().mockReturnValue([]) };
      ctx.getManager.mockReturnValue(stateManager);
      await cm.initChart(document.createElement("canvas"));

      cm._hDragActive = true;
      cm.dragDatasetIndex = 0;
      cm.dragActiveIndex = 1;
      cm.dragSelectedPoints = [1];
      cm.hDragNeighbors = [2];
      cm.initialSelectedX = { 1: 300, 2: 301 };
      cm.dragBounds = { 1: { left: 0, right: 1440 }, 2: { left: 0, right: 1440 } };

      mockChartInstance.data.datasets[0].data = [
        { x: 0, y: 20 },
        { x: 300, y: 22 },
        { x: 301, y: 22 },
        { x: 1439, y: 20 },
      ];
      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(400);

      cm._onWindowPointerMove({ pointerId: null, clientX: 100 });
      expect(mockChartInstance.data.datasets[0].data[1].x).toBeGreaterThan(300);
      expect(mockChartInstance.data.datasets[0].data[2].x).toBeGreaterThan(301);
    });
  });

  describe("Zoom and Pan Callbacks", () => {
    it("exercises zoom and pan logic", async () => {
      const stateManager = { getData: vi.fn().mockReturnValue([]) };
      ctx.getManager.mockReturnValue(stateManager);
      await cm.initChart(document.createElement("canvas"));

      const options = cm._buildChartOptions();
      const zoom = options.plugins.zoom;

      // onPanStart
      cm.lastMousePosition = { x: 5, y: 5 }; // Over Y axis (pos.x <= y.right)
      expect(zoom.pan.onPanStart()).toBe(true);
      cm._isDragging = true;
      expect(zoom.pan.onPanStart()).toBe(false);
      cm._isDragging = false;

      // mode (pan)
      // pos.y >= x.top -> "x"
      cm.lastMousePosition = { x: 100, y: 140 }; // Over X axis area (x.top=100)
      expect(zoom.pan.mode()).toBe("x");
      cm.lastMousePosition = { x: 10, y: 50 }; // Near Y axis (y.top=0, x.top=100)
      expect(zoom.pan.mode()).toBe("y");

      // onPan / onPanComplete
      const fakeChart = { ...mockChartInstance, options: { scales: { x: { ticks: {} } } } };
      zoom.pan.onPan({ chart: fakeChart });
      zoom.pan.onPanComplete({ chart: fakeChart });

      // onZoomStart
      expect(zoom.zoom.onZoomStart()).toBe(true);
      cm._isDragging = true;
      expect(zoom.zoom.onZoomStart()).toBe(false);
      cm._isDragging = false;

      // onZoom
      cm.lastMousePosition = { x: 60, y: 50 }; // Inside (pos.x > y.right=50, pos.y < x.top=100)
      zoom.zoom.onZoom({ chart: fakeChart });
      expect(ctx._card.isExpandedH).toBe(true);
      expect(ctx._card.isExpandedV).toBe(true);

      // onZoomComplete
      zoom.zoom.onZoomComplete({ chart: fakeChart });
    });
  });

  describe("DragData Plugin Callbacks", () => {
    it("exercises dragData logic for switch preset", async () => {
      ctx.config.is_switch_preset = true;
      const selectionManager = { 
        getSelectedPoints: vi.fn(() => [1]),
        getAnchor: vi.fn(() => 1)
      };
      const stateManager = { 
        getData: vi.fn().mockReturnValue([]),
        setData: vi.fn()
      };
      ctx.getManager.mockImplementation((k) => k === 'selection' ? selectionManager : stateManager);
      
      await cm.initChart(document.createElement("canvas"));
      const options = cm._buildChartOptions();
      const dd = options.plugins.dragData;

      // magnet.to (implementation returns simple value if not object)
      expect(dd.magnet.to(0.7)).toBe(1);
      expect(dd.magnet.to({ y: 0.3 })).toEqual({ y: 0 });

      // onDragStart
      mockChartInstance.data.datasets[0].data = [
        { x: 0, y: 0 },
        { x: 360, y: 1 },
        { x: 361, y: 1 },
        { x: 1439, y: 0 },
      ];
      dd.onDragStart({}, 0, 1, 1);
      expect(cm._isDragging).toBe(true);
      expect(cm.dragNeighbors).toContain(2);

      // onDrag
      dd.onDrag({}, 0, 1, 0.8);
      expect(mockChartInstance.data.datasets[0].data[1].y).toBe(1);

      // onDragEnd
      dd.onDragEnd({}, 0, 1, 1);
      expect(cm._isDragging).toBe(false);
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
        togglePoint: vi.fn()
      };
      stateManager = { 
        getData: vi.fn().mockReturnValue([{time: "00:00", value: 20}, {time: "23:59", value: 20}]), 
        alignSelectedPoints: vi.fn(),
        insertPoint: vi.fn().mockReturnValue(1)
      };
      ctx.getManager.mockImplementation((k) => k === "selection" ? selectionManager : stateManager);
      await cm.initChart(document.createElement("canvas"));
    });

    it("handles alt-click for alignment", async () => {
      const event = { native: { altKey: true, preventDefault: vi.fn(), stopPropagation: vi.fn() } };
      cm._handleClick(event, []);
      expect(stateManager.alignSelectedPoints).toHaveBeenCalledWith("left");
    });

    it("handles click near existing point to select it", async () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 1 }]);
      mockChartInstance.getDatasetMeta.mockReturnValue({ data: [{ x: 50, y: 50 }, { x: 150, y: 100 }] });
      cm._getCanvasRelativePosition = () => ({ x: 155, y: 105 }); // Near point 1 (dist <= 25)

      cm._handleClick({ native: {} }, []);
      expect(selectionManager.selectPoint).toHaveBeenCalledWith(1);
    });

    it("handles shift-click and ctrl-click near point", async () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 1 }]);
      mockChartInstance.getDatasetMeta.mockReturnValue({ data: [{ x: 50, y: 50 }, { x: 150, y: 100 }] });
      cm._getCanvasRelativePosition = () => ({ x: 155, y: 105 });

      cm._handleClick({ native: { shiftKey: true } }, []);
      expect(selectionManager.selectRange).toHaveBeenCalledWith(1);

      cm._handleClick({ native: { ctrlKey: true } }, []);
      expect(selectionManager.togglePoint).toHaveBeenCalledWith(1);
    });

    it("handles click to insert new point", async () => {
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
      cm._getCanvasRelativePosition = () => ({ x: 150, y: 75 });
      mockChartInstance.scales.x.getValueForPixel.mockReturnValue(720); // 12:00
      mockChartInstance.scales.y.getPixelForValue.mockReturnValue(75);
      mockChartInstance.scales.y.getValueForPixel.mockReturnValue(22);

      cm._handleClick({ native: {} }, []);
      expect(stateManager.insertPoint).toHaveBeenCalledWith("12:00", 22);
    });
  });

  describe("UI / DOM Helpers", () => {
    it("exercises _showHoverInfo branches", async () => {
      const stateManager = { getData: vi.fn().mockReturnValue([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }]) };
      ctx.getManager.mockReturnValue(stateManager);
      await cm.initChart(document.createElement("canvas"));

      // Outside bounds
      cm._getCanvasRelativePosition = () => ({ x: -10, y: -10 });
      cm._showHoverInfo({});
      
      // Inside bounds
      cm._getCanvasRelativePosition = () => ({ x: 150, y: 75 });
      cm._showHoverInfo({});
      
      // With switch preset
      ctx.config.is_switch_preset = true;
      cm._showHoverInfo({});
    });
  });
});
