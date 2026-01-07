import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardEventHandlers } from '../src/core/CardEventHandlers.js';
import { PointerHandler } from '../src/handlers/pointer_handler.js';
import { CardLifecycle } from '../src/core/CardLifecycle.js';
import { StateManager } from '../src/managers/state_manager.js';
import { EventBus } from '../src/core/EventBus.js';

describe('Final Coverage Boost', () => {
  let card;
  
  beforeEach(() => {
    card = {
      getManager: vi.fn(name => card[`${name}Manager`]),
      events: new EventBus(),
      config: { 
        target_entity: 'climate.test', 
        global_prefix: 'test_',
        is_switch_preset: false,
        min_value: 15,
        max_value: 30,
        step_value: 0.5
      },
      hass: {
        states: {
          'climate.test': { attributes: { temperature: 20 } },
          'switch.test_enabled': { state: 'on' }
        },
        callService: vi.fn().mockResolvedValue({}),
        callWS: vi.fn().mockResolvedValue({ response: {} })
      },
      language: 'en',
      localizationManager: { localize: vi.fn((l, k) => k) },
      stateManager: null, // set in tests
      selectionManager: {
        clearSelection: vi.fn(),
        selectPoint: vi.fn(),
        selectIndices: vi.fn(),
        getSelectedPoints: vi.fn(() => []),
        getActiveIndices: vi.fn(() => []),
        logSelection: vi.fn()
      },
      chartManager: {
        isInitialized: vi.fn(() => true),
        getChart: vi.fn(() => ({ 
          options: { scales: { y: { min: 0, max: 100 } } },
          scales: { x: { top: 100 }, y: { right: 10 } },
          update: vi.fn()
        })),
        update: vi.fn(),
        updateData: vi.fn(),
        updatePointStyles: vi.fn(),
        updateChartLabels: vi.fn(),
        recreateChartOptions: vi.fn(),
        scheduleHideDragValueDisplay: vi.fn()
      },
      keyboardHandler: { enable: vi.fn(), disable: vi.fn() },
      pointerHandler: { attachListeners: vi.fn(), detachListeners: vi.fn() },
      cardSync: { 
        updateAutomationSync: vi.fn(),
        scheduleAutomationOverlaySuppression: vi.fn()
      },
      cardLifecycle: null,
      requestUpdate: vi.fn(),
      isEditorContext: vi.fn(() => false),
      shadowRoot: {
        getElementById: vi.fn(() => ({ style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) })),
        querySelector: vi.fn(() => ({ 
          focus: vi.fn(),
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) 
        }))
      }
    };
    card.stateManager = new StateManager(card);
    card.cardLifecycle = new CardLifecycle(card);
    card.cardLifecycle.updateReadyFlag = vi.fn();
  });

  it('covers various CardEventHandlers branches', async () => {
    const handlers = new CardEventHandlers(card);
    
    // Test handleLoggingToggle
    await handlers.handleLoggingToggle({ 
      target: { checked: true }, 
      stopPropagation: vi.fn(), 
      preventDefault: vi.fn() 
    });
    expect(card.loggingEnabled).toBe(true);

    // Test handlePresetChange
    await handlers.handlePresetChange({
      target: { value: 'ev_charging' },
      stopPropagation: vi.fn(),
      preventDefault: vi.fn()
    });
    expect(card.selectedPreset).toBe('ev_charging');

    // Test handleAlignLeft
    card.selectionManager.getSelectedPoints.mockReturnValue([1, 2]);
    handlers.handleAlignLeft();
    
    // Test handleAlignRight
    handlers.handleAlignRight();
  });

  it('covers various PointerHandler branches', () => {
    const handler = new PointerHandler(card);
    
    // Mock getContainerRelativeCoords
    const coordsSpy = vi.spyOn(handler, 'getContainerRelativeCoords');
    
    // PointerDown inside chart area
    coordsSpy.mockReturnValue({ x: 50, y: 50 });
    handler.onPointerDown({ pointerId: 1, ctrlKey: false });
    expect(handler.pendingSelectStart).not.toBeNull();
    
    // PointerMove triggers selection (must exceed threshold of 6px)
    coordsSpy.mockReturnValue({ x: 60, y: 60 });
    handler.onPointerMove({ pointerId: 1, target: { setPointerCapture: vi.fn() } });
    expect(handler.isSelecting).toBe(true);
    
    // PointerUp completes selection
    handler.onPointerUp({ pointerId: 1, target: { releasePointerCapture: vi.fn() } });
    expect(handler.isSelecting).toBe(false);
  });

  it('covers StateManager edge cases', () => {
    const sm = card.stateManager;
    
    // Insert existing point
    sm.setData([{ time: '10:00', value: 20 }]);
    sm.insertPoint('10:00', 25);
    expect(sm.getData().find(p => p.time === '10:00').value).toBe(25);
    
    // Remove point (non-boundary)
    sm.insertPoint('12:00', 22);
    const idx = sm.getData().findIndex(p => p.time === '12:00');
    sm.removePoint(idx);
    expect(sm.getData().find(p => p.time === '12:00')).toBeUndefined();
    
    // Undo/Redo
    sm.insertPoint('15:00', 28);
    sm.undo();
    expect(sm.getData().find(p => p.time === '15:00')).toBeUndefined();
    sm.redo();
    expect(sm.getData().find(p => p.time === '15:00')).toBeDefined();
  });
});
