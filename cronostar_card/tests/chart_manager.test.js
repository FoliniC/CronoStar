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

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = makeContext();
    cm = new ChartManager(ctx);
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
          getAnchor: vi.fn(() => 1)
        };
        ctx.getManager.mockImplementation((k) => k === 'state' ? stateManager : selectionManager);
        const canvas = document.createElement('canvas');
        vi.spyOn(canvas, 'addEventListener');
        await cm.initChart(canvas);
        
        const pointerDownHandler = canvas.addEventListener.mock.calls.find(c => c[0] === 'pointerdown')[1];
        
        // button !== 0
        pointerDownHandler({ button: 1 });
        
        // !mainHit
        mockChartInstance.getElementsAtEventForMode.mockReturnValue([]);
        pointerDownHandler({ button: 0 });
  
        // mainHit
        mockChartInstance.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 1 }]);
        mockChartInstance.data.datasets[0].data = [{x: 0, y: 0}, {x: 300, y: 10}, {x: 1439, y: 0}];
        pointerDownHandler({ button: 0, pointerId: 1 });
        expect(selectionManager.selectPoint).toHaveBeenCalledWith(1);
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

    it("handles snap minutes and boundary clamping", () => {
        cm._hDragActive = true;
        cm.chart = mockChartInstance;
        cm.dragDatasetIndex = 0;
        cm.dragActiveIndex = 1;
        cm.initialSelectedX = { 1: 300 };
        cm.dragBounds = { 1: { left: 0, right: 1440 } };
        mockChartInstance.data.datasets[0].data = [{x:0, y:0}, {x:300, y:10}, {x:1439, y:0}];
        
        mockChartInstance.scales.x.getValueForPixel.mockReturnValue(305);
        cm._onWindowPointerMove({ clientX: 305, pointerId: null, shiftKey: true });
        
        mockChartInstance.scales.x.getValueForPixel.mockReturnValue(1500);
        cm._onWindowPointerMove({ clientX: 1500, pointerId: null });
        expect(mockChartInstance.data.datasets[0].data[1].x).toBe(1439);
    });

    it("exercises _onWindowPointerMove with is_switch_preset and neighbors", () => {
        ctx.config.is_switch_preset = true;
        cm._hDragActive = true;
        cm.chart = mockChartInstance;
        cm.dragDatasetIndex = 0;
        cm.dragActiveIndex = 1;
        cm.dragStartX = 300;
        cm.initialSelectedX = { 1: 300, 2: 301 };
        cm.dragBounds = { 1: { left: 0, right: 1440 }, 2: { left: 0, right: 1440 } };
        cm.dragSelectedPoints = [1];
        cm.hDragNeighbors = [2];
        
        mockChartInstance.data.datasets[0].data = [
            { x: 0, y: 0 }, { x: 300, y: 1 }, { x: 301, y: 1 }, { x: 1439, y: 0 }
        ];
        mockChartInstance.scales.x.getValueForPixel.mockReturnValue(310);
        cm._onWindowPointerMove({ clientX: 310, pointerId: null });
        expect(mockChartInstance.update).toHaveBeenCalled();
    });

    it("handles switch preset in _onWindowPointerUp", () => {
        cm._hDragActive = true;
        cm.chart = mockChartInstance;
        ctx.config.is_switch_preset = true;
        const stateManager = {
          setData: vi.fn(),
          getDataWithChangePoints: vi.fn(() => [{time: "00:00", value: 1}])
        };
        ctx.getManager.mockReturnValue(stateManager);
        mockChartInstance.data.datasets[0].data = [{x: 0, y: 1}];
  
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
      
      cm.lastMousePosition = { x: 100, y: 140 }; 
      expect(zoom.pan.mode()).toBe("x");
      cm.lastMousePosition = { x: 10, y: 50 }; 
      expect(zoom.pan.mode()).toBe("y");

      const fakeChart = { ...mockChartInstance, options: { scales: { x: { ticks: {} } } } };
      zoom.pan.onPan({ chart: fakeChart });
      zoom.pan.onPanComplete({ chart: fakeChart });

      expect(zoom.zoom.onZoomStart()).toBe(true);
      
      cm.lastMousePosition = { x: 60, y: 50 }; 
      zoom.zoom.onZoom({ chart: fakeChart });
      expect(ctx._card.isExpandedH).toBe(true);

      zoom.zoom.onZoomComplete({ chart: fakeChart });
    });
  });

  describe("DragData Plugin Callbacks", () => {
    it("exercises dragData logic", async () => {
      ctx.config.is_switch_preset = true;
      const selectionManager = { getSelectedPoints: vi.fn(() => [1]), getAnchor: vi.fn(() => 1) };
      const stateManager = { getData: vi.fn().mockReturnValue([]), setData: vi.fn() };
      ctx.getManager.mockImplementation((k) => k === 'selection' ? selectionManager : stateManager);
      
      await cm.initChart(document.createElement("canvas"));
      const options = cm._buildChartOptions();
      const dd = options.plugins.dragData;

      expect(dd.magnet.to(0.7)).toBe(1);
      expect(dd.magnet.to({ y: 0.3 })).toEqual({ y: 0 });

      mockChartInstance.data.datasets[0].data = [{ x: 0, y: 0 }, { x: 360, y: 1 }, { x: 361, y: 1 }, { x: 1439, y: 0 }];
      dd.onDragStart({}, 0, 1, 1);
      dd.onDrag({}, 0, 1, 0.8);
      dd.onDragEnd({}, 0, 1, 1);
      expect(cm._isDragging).toBe(false);
    });
  });

  describe("Click Logic - _handleClick", () => {
    let selectionManager, stateManager;

    beforeEach(async () => {
      selectionManager = { 
        selectPoint: vi.fn(), clearSelection: vi.fn(), getSelectedPoints: vi.fn(() => []), 
        getAnchor: vi.fn(() => -1), selectRange: vi.fn(), togglePoint: vi.fn()
      };
      stateManager = { 
        getData: vi.fn().mockReturnValue([{time: "00:00", value: 20}, {time: "23:59", value: 20}]), 
        alignSelectedPoints: vi.fn(), insertPoint: vi.fn().mockReturnValue(1)
      };
      ctx.getManager.mockImplementation((k) => k === "selection" ? selectionManager : stateManager);
      await cm.initChart(document.createElement("canvas"));
    });

    it("handles alt-click for alignment", async () => {
      const event = { native: { altKey: true, preventDefault: vi.fn(), stopPropagation: vi.fn() } };
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
      mockChartInstance.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 1 }]);
      mockChartInstance.getDatasetMeta.mockReturnValue({ data: [{ x: 50, y: 50 }, { x: 150, y: 100 }] });
      cm._getCanvasRelativePosition = () => ({ x: 155, y: 105 }); 

      cm._handleClick({ native: {} }, []);
      expect(selectionManager.selectPoint).toHaveBeenCalledWith(1);
    });
  });

  describe("Interpolation and Data Updates", () => {
    it("handles all interpolation branches", () => {
        cm.chart = mockChartInstance;
        mockChartInstance.data.datasets[0].data = [{x: 100, y: 10}, {x: 200, y: 20}];
        
        expect(cm._interpolateValueAtMinutes(50)).toBe(10);
        expect(cm._interpolateValueAtMinutes(250)).toBe(20);
        expect(cm._interpolateValueAtMinutes(300)).toBe(20);
        
        ctx.config.is_switch_preset = true;
        expect(cm._interpolateValueAtMinutes(150)).toBe(10);
    });

    it("updates corner dataset for switch preset", () => {
        ctx.config.is_switch_preset = true;
        const stateManager = { getData: vi.fn(() => [{time: "00:00", value: 0}, {time: "10:00", value: 1}]) };
        ctx.getManager.mockReturnValue(stateManager);
        cm.chart = mockChartInstance;
        mockChartInstance.data.datasets = [ { data: [] }, { data: [], label: "Corners" } ];
        cm.updateData([]);
        expect(mockChartInstance.data.datasets[1].data.length).toBeGreaterThan(0);
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

    it("exercises other small methods", () => {
        cm._initialized = true;
        cm.chart = { update: vi.fn() };
        expect(cm.isInitialized()).toBe(true);
        cm.updateChartLabels();
        cm.update('none');
        expect(cm.chart.update).toHaveBeenCalled();
        cm.updatePointStyling();
        cm.updateData([]);
    });

    it("getIndicesInArea handles empty result", () => {
        cm.chart = mockChartInstance;
        mockChartInstance.getDatasetMeta.mockReturnValue({ data: [] });
        expect(cm.getIndicesInArea(0, 0, 10, 10)).toEqual([]);
    });

    it("deletePointAtEvent handles success", () => {
        const stateManager = { removePoint: vi.fn() };
        ctx.getManager.mockReturnValue(stateManager);
        cm.chart = mockChartInstance;
        mockChartInstance.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 1 }]);
        expect(cm.deletePointAtEvent({})).toBe(true);
        expect(stateManager.removePoint).toHaveBeenCalledWith(1);
    });
  });

  describe("UI Helpers", () => {
    it("exercises _showHoverInfo branches", async () => {
      const stateManager = { getData: vi.fn().mockReturnValue([{ time: "00:00", value: 20 }, { time: "23:59", value: 20 }]) };
      ctx.getManager.mockReturnValue(stateManager);
      await cm.initChart(document.createElement("canvas"));

      cm._getCanvasRelativePosition = () => ({ x: -10, y: -10 });
      cm._showHoverInfo({});
      
      cm._getCanvasRelativePosition = () => ({ x: 150, y: 75 });
      cm._showHoverInfo({});
    });

    it("handles showDragValueDisplay positioning and touch events", () => {
        cm.chart = mockChartInstance;
        mockChartInstance.scales.x.getPixelForValue.mockReturnValue(280);
        cm.showDragValueDisplay(20, 1400);
        expect(ctx._card.shadowRoot.getElementById('drag-value-display').style.left).toBeDefined();

        cm.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
        const e = { touches: [{ clientX: 100, clientY: 200 }] };
        expect(cm._getCanvasRelativePosition(e)).toEqual({ x: 100, y: 200 });
        
        const e2 = { changedTouches: [{ clientX: 50, clientY: 60 }] };
        expect(cm._getCanvasRelativePosition(e2)).toEqual({ x: 50, y: 60 });
    });
  });
});
