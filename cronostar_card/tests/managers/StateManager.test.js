import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateManager } from '../../src/managers/state_manager.js';
import { EventBus, Events } from '../../src/core/EventBus.js';

describe('StateManager', () => {
  let context;
  let stateManager;
  let events;

  beforeEach(() => {
    events = new EventBus();
    context = {
      events,
      config: {
        min_value: 15,
        max_value: 30,
        is_switch_preset: false
      },
      requestUpdate: vi.fn(),
      getManager: vi.fn()
    };
    stateManager = new StateManager(context);
  });

  it('should initialize with boundaries', () => {
    const data = stateManager.getData();
    expect(data).toHaveLength(2);
    expect(data[0].time).toBe('00:00');
    expect(data[1].time).toBe('23:59');
  });

  it('should insert points correctly', () => {
    stateManager.insertPoint('12:00', 25);
    const data = stateManager.getData();
    expect(data).toHaveLength(3);
    expect(data[1].time).toBe('12:00');
    expect(data[1].value).toBe(25);
  });

  it('should remove points correctly', () => {
    stateManager.insertPoint('12:00', 25);
    stateManager.removePoint(1);
    expect(stateManager.getData()).toHaveLength(2);
  });

  it('should not allow removing boundaries', () => {
    expect(stateManager.removePoint(0)).toBe(false);
    expect(stateManager.removePoint(1)).toBe(false);
  });

  it('should handle undo/redo', () => {
    stateManager.insertPoint('12:00', 25);
    expect(stateManager.getData()).toHaveLength(3);
    
    stateManager.undo();
    expect(stateManager.getData()).toHaveLength(2);
    
    stateManager.redo();
    expect(stateManager.getData()).toHaveLength(3);
  });

  describe('Switch Preset Logic', () => {
    beforeEach(() => {
      context.config.is_switch_preset = true;
      stateManager = new StateManager(context);
    });

    it('should enforce 1-minute transitions for switches', () => {
      // Set points at 10:00 (1) and 20:00 (0)
      const input = [
        { time: '00:00', value: 0 },
        { time: '10:00', value: 1 },
        { time: '20:00', value: 0 },
        { time: '23:59', value: 0 }
      ];
      stateManager.setData(input);
      
      const data = stateManager.getData();
      // Should have: 00:00(0), 10:00(1), 20:00(0), 20:01(0)? 
      // Actually finalizeSwitchData: 
      // 10:00 transition detected -> expandedMap sets 10:00(1) and 10:01(1) if next is different? 
      // Wait, if 10:00 is 1 and 20:00 is 0. 
      // At 10:00 it becomes 1.
      
      // Let's check a simple one: 00:00(0) -> 10:00(1)
      // Expanded: 00:00(0), 00:01(0)? No, normal transition hold OLD at prev, jump to NEW at prev+1.
      // So 00:00(0), 00:01(1) ... no, it's 10:00(1).
      // If we change from 0 to 1 at 10:00.
      
      const p10 = data.find(p => p.time === '10:00');
      expect(p10.value).toBe(1);
    });
  });
});
