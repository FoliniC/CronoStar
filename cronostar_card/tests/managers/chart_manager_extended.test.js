// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChartManager } from '../../src/managers/chart_manager.js';

describe('ChartManager Extended', () => {
  let context;
  let manager;
  let mockChart;
  let stateManagerMock;
  let selectionManagerMock;

  beforeEach(() => {
    mockChart = {
      destroy: vi.fn(),
      update: vi.fn(),
      resize: vi.fn(),
      data: { datasets: [{ data: [] }] },
      options: { scales: { x: { ticks: {} }, y: {} } },
      getDatasetMeta: vi.fn(() => ({ data: [{ x: 50, y: 50 }] })),
      chartArea: { left: 0, right: 100, top: 0, bottom: 100 },
      scales: {
        x: {
          getValueForPixel: vi.fn(x => x / 2),
          getPixelForValue: vi.fn(val => val * 2),
          left: 0, right: 100, top: 0, bottom: 100
        },
        y: {
          getValueForPixel: vi.fn(y => y / 2),
          getPixelForValue: vi.fn(val => val * 2),
          left: 0, right: 100, top: 0, bottom: 100
        }
      },
      canvas: {
        style: {},
        getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 100, height: 100 })),
        isConnected: true
      },
      getElementsAtEventForMode: vi.fn(() => [])
    };

    stateManagerMock = { 
      getData: vi.fn(() => [{ time: '00:00', value: 20 }]),
      setData: vi.fn(),
      insertPoint: vi.fn((...args) => console.log('insertPoint called', args)),
      removePoint: vi.fn(),
      getNumPoints: vi.fn(() => 1)
    };

    selectionManagerMock = {
      getSelectedPoints: vi.fn(() => []),
      selectPoint: vi.fn((...args) => console.log('selectPoint called', args)),
      clearSelection: vi.fn(),
      isSelected: vi.fn(() => false),
      getAnchor: vi.fn(() => null)
    };

    context = {
      config: {
        is_switch_preset: false,
        min_value: 10,
        max_value: 30,
        step_value: 0.5,
        drag_snap: {}
      },
      events: { on: vi.fn(), emit: vi.fn() },
      getManager: vi.fn(name => {
        if (name === 'state') return stateManagerMock;
        if (name === 'selection') return selectionManagerMock;
      }),
      _card: {
        shadowRoot: {
          getElementById: vi.fn(id => ({ style: {}, textContent: '' })),
          querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ width: 100 }) }))
        }
      }
    };
    manager = new ChartManager(context);
    
    // Inject mock chart directly/via init
    const canvas = document.createElement('canvas');
    manager.initChart(canvas);
    manager.chart = mockChart;
    manager._initialized = true;
  });

  it('should update chart data', () => {
    manager._updateChartData();
    expect(mockChart.update).toHaveBeenCalledWith('none');
    expect(mockChart.data.datasets[0].data.length).toBeGreaterThan(0);
  });

  it('should handle resize', () => {
    manager._setupResizeObserver(document.createElement('div'));
    expect(manager._resizeObserver).toBeDefined();
  });

  it('should destroy chart', () => {
    manager.destroy();
    expect(mockChart.destroy).toHaveBeenCalled();
    expect(manager.chart).toBeNull();
  });

  it('should interpolate value', () => {
    mockChart.data.datasets[0].data = [{ x: 0, y: 10 }, { x: 60, y: 20 }];
    const val = manager._interpolateValueAtMinutes(30);
    expect(val).toBe(15);
  });

  it('should show hover info', () => {
    const e = { clientX: 10, clientY: 10, preventDefault: vi.fn() };
    manager._showHoverInfo(e);
    // Expect getElementById to have been called for 'hover-value-display'
    expect(context._card.shadowRoot.getElementById).toHaveBeenCalledWith('hover-value-display');
  });

  it('should handle click on point', () => {
    const e = { native: { clientX: 50, clientY: 50 } };
    mockChart.getElementsAtEventForMode.mockReturnValue([{ datasetIndex: 0, index: 0 }]);
    
    manager._handleClick(e);
    
    expect(selectionManagerMock.selectPoint).toHaveBeenCalledWith(0);
  });
});
