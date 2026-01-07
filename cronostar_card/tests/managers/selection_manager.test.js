import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectionManager } from '../../src/managers/selection_manager.js';

describe('SelectionManager', () => {
  let context;
  let manager;
  let stateManager;

  beforeEach(() => {
    stateManager = {
      getNumPoints: vi.fn(() => 10),
      getPointLabel: vi.fn(i => `Point ${i}`)
    };
    context = {
      events: {
        on: vi.fn(),
        emit: vi.fn()
      },
      getManager: vi.fn(name => name === 'state' ? stateManager : null),
      _card: {}
    };
    manager = new SelectionManager(context);
  });

  it('should select a point', () => {
    manager.selectPoint(5);
    expect(manager.getSelectedPoints()).toEqual([5]);
  });

  it('should snapshot and restore', () => {
    manager.selectPoint(3);
    manager.togglePoint(7);
    
    expect(manager.getSelectedPoints()).toContain(3);
    expect(manager.getSelectedPoints()).toContain(7);
    
    manager.snapshotSelection();
    manager.clearSelection();
    expect(manager.getSelectedPoints()).toEqual([]);
    
    manager.restoreSelection();
    expect(manager.getSelectedPoints()).toContain(3);
    expect(manager.getSelectedPoints()).toContain(7);
  });
});
