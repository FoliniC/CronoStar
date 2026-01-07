import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChartManager } from '../../src/managers/chart_manager.js';
import { Events } from '../../src/core/EventBus.js';

vi.mock('chart.js/auto', () => {
  const mockChartInstance = {
    destroy: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    scales: {
      x: { min: 0, max: 1440, top: 0, bottom: 100, getValueForPixel: vi.fn() },
      y: { min: 0, max: 30, left: 0, right: 100, getValueForPixel: vi.fn() }
    },
    data: { datasets: [{ data: [] }] },
    options: { scales: { x: { ticks: {} } } }
  };

  class MockChart {
    constructor() {
      return mockChartInstance;
    }
    static register = vi.fn();
  }

  return {
    default: MockChart,
    register: MockChart.register
  };
});

// Mock ResizeObserver
global.ResizeObserver = class {
  constructor(callback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('ChartManager', () => {
  let context;
  let manager;
  let stateManager;
  let selectionManager;

  beforeEach(() => {
    stateManager = {
      getData: vi.fn(() => []),
      setData: vi.fn()
    };
    selectionManager = {
      getSelectedPoints: vi.fn(() => []),
      getAnchor: vi.fn(() => null)
    };
    context = {
      events: {
        on: vi.fn(),
        emit: vi.fn()
      },
      config: {
        min_value: 15,
        max_value: 30,
        step_value: 0.5
      },
      getManager: vi.fn(name => {
        if (name === 'state') return stateManager;
        if (name === 'selection') return selectionManager;
        return null;
      }),
      _card: { requestUpdate: vi.fn() }
    };
    manager = new ChartManager(context);
  });

  it('should initialize correctly', async () => {
    const mockCanvas = document.createElement('canvas');
    mockCanvas.id = 'myChart';
    // Adding to DOM to satisfy some checks if any
    document.body.appendChild(mockCanvas);
    
    const result = await manager.initChart(mockCanvas);
    expect(result).toBe(true);
    expect(manager.isInitialized()).toBe(true);
    expect(context.events.emit).toHaveBeenCalledWith(Events.CHART_READY);
  });

  it('should cleanup on destroy', async () => {
    const mockCanvas = document.createElement('canvas');
    await manager.initChart(mockCanvas);
    
    manager.destroy();
    expect(manager.chart).toBeNull();
    expect(manager.canvas).toBeNull();
    expect(context.events.emit).toHaveBeenCalledWith(Events.CHART_DESTROYED);
  });

  it('should update data', async () => {
    const mockCanvas = document.createElement('canvas');
    await manager.initChart(mockCanvas);
    
    const newData = [{ time: '00:00', value: 20 }];
    stateManager.getData.mockReturnValue(newData);
    
    manager.updateData(newData);
    // updateChartData is called which updates chart.data.datasets[0].data
    expect(manager.chart.data.datasets[0].data).toHaveLength(1);
    expect(manager.chart.update).toHaveBeenCalled();
  });
});
