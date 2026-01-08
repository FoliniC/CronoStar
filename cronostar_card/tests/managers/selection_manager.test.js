import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { Events } from '../../src/core/EventBus.js';

describe('SelectionManager', () => {
  let context;
  let manager;
  let stateManager;
  let listeners = {};

  beforeEach(() => {
    listeners = {};
    stateManager = {
      getNumPoints: vi.fn(() => 10),
      getPointLabel: vi.fn(i => `Point ${i}`)
    };
    context = {
      events: {
        on: vi.fn((event, callback) => {
          listeners[event] = callback;
        }),
        emit: vi.fn()
      },
      getManager: vi.fn(name => name === 'state' ? stateManager : null),
      _card: {
        pointerHandler: {
          onPointerDown: vi.fn(),
          onPointerMove: vi.fn(),
          onPointerUp: vi.fn()
        }
      }
    };
    manager = new SelectionManager(context);
  });

  it('should select a point', () => {
    manager.selectPoint(5);
    expect(manager.getSelectedPoints()).toEqual([5]);
    expect(manager.getAnchor()).toBe(5);
    expect(manager.selectedPoint).toBe(5);
    expect(manager.isSelected(5)).toBe(true);
    expect(manager.isAnchor(5)).toBe(true);
    expect(context.events.emit).toHaveBeenCalledWith(Events.SELECTION_CHANGED, expect.anything());
  });

  it('should toggle a point', () => {
    manager.selectPoint(5);
    manager.togglePoint(6);
    expect(manager.getSelectedPoints()).toContain(5);
    expect(manager.getSelectedPoints()).toContain(6);
    expect(manager.getAnchor()).toBe(6);

    manager.togglePoint(5);
    expect(manager.getSelectedPoints()).toEqual([6]);
    expect(manager.getAnchor()).toBe(6);

    manager.togglePoint(6);
    expect(manager.getSelectedPoints()).toEqual([]);
    expect(manager.getAnchor()).toBeNull();
  });

  it('should select a range', () => {
    // Range without anchor (sets anchor first)
    manager.selectRange(2);
    expect(manager.getSelectedPoints()).toEqual([2]);
    expect(manager.getAnchor()).toBe(2);

    // Range with anchor
    manager.selectRange(5);
    expect(manager.getSelectedPoints().sort()).toEqual([2, 3, 4, 5]);
    
    // Reverse range
    manager.setAnchor(5);
    manager.selectRange(2);
    expect(manager.getSelectedPoints().sort()).toEqual([2, 3, 4, 5]);
  });

  it('should select indices', () => {
    manager.selectIndices([1, 3, 5]);
    expect(manager.getSelectedPoints().sort()).toEqual([1, 3, 5]);
    expect(manager.getAnchor()).toBe(1);

    // With preserve anchor
    manager.setAnchor(3);
    manager.selectIndices([1, 5], true); // 3 is removed, so anchor changes to 1
    expect(manager.getSelectedPoints().sort()).toEqual([1, 5]);
    expect(manager.getAnchor()).toBe(1);

    manager.selectIndices([1, 3, 5]);
    manager.setAnchor(3);
    manager.selectIndices([1, 3, 5], true); // 3 kept
    expect(manager.getAnchor()).toBe(3);
  });

  it('should filter invalid indices', () => {
    manager.selectIndices([1, -1, 3.5, '2', null]);
    expect(manager.getSelectedPoints()).toEqual([1]);
  });

  it('should select all', () => {
    manager.selectAll();
    expect(manager.getSelectedPoints()).toHaveLength(10);
    expect(manager.getAnchor()).toBe(0);
  });

  it('should clear selection', () => {
    manager.selectPoint(1);
    manager.clearSelection();
    expect(manager.getSelectedPoints()).toEqual([]);
    expect(manager.getAnchor()).toBeNull();
  });

  it('should handle snapshot and restore', () => {
    manager.selectPoint(3);
    manager.snapshotSelection();
    
    manager.clearSelection();
    manager.restoreSelection();
    
    expect(manager.getSelectedPoints()).toEqual([3]);
    expect(manager.getAnchor()).toBe(3);
  });

  it('should handle restore without snapshot', () => {
    manager.restoreSelection(); // No crash
    expect(manager.getSelectedPoints()).toEqual([]);
  });

  it('should handle snapshot with no selection', () => {
    manager.clearSelection();
    manager.snapshotSelection(); // Stores null snapshot
    
    manager.selectPoint(1);
    manager.restoreSelection(); // Should do nothing/warn
    expect(manager.getSelectedPoints()).toEqual([1]); // Selection persists because restore did nothing
  });

  it('should validate selection on schedule update', () => {
    manager.selectPoint(5);
    manager.togglePoint(12); // Out of bounds (max 9)
    // Note: selectPoint/togglePoint do not validate immediately in implementation, validation happens on update event
    // But togglePoint adds it to Set.
    
    // Simulate schedule update event
    if (listeners[Events.SCHEDULE_UPDATED]) {
      listeners[Events.SCHEDULE_UPDATED]();
    }
    
    expect(manager.getSelectedPoints()).toEqual([5]); // 12 should be removed
  });

  it('should handle setAnchor', () => {
    manager.selectIndices([1, 2]);
    manager.setAnchor(2);
    expect(manager.getAnchor()).toBe(2);
    
    manager.setAnchor(3); // Not in selection
    expect(manager.getAnchor()).toBe(2);
  });

  it('should delegate pointer events', () => {
    const e = {};
    manager.handlePointerDown(e);
    expect(context._card.pointerHandler.onPointerDown).toHaveBeenCalledWith(e);
    
    manager.handlePointerMove(e);
    expect(context._card.pointerHandler.onPointerMove).toHaveBeenCalledWith(e);
    
    manager.handlePointerUp(e);
    expect(context._card.pointerHandler.onPointerUp).toHaveBeenCalledWith(e);
  });

  it('should return active indices', () => {
    expect(manager.getActiveIndices()).toEqual([]);
    manager.selectPoint(1);
    expect(manager.getActiveIndices()).toEqual([1]);
    
    // Anchor only? (Impossible via public API unless set manually, but getActiveIndices handles it)
    manager.clearSelection();
    manager._anchorPoint = 5;
    expect(manager.getActiveIndices()).toEqual([5]);
  });
  
  it('should cleanup on destroy', () => {
    manager.selectPoint(1);
    manager.snapshotSelection();
    manager.destroy();
    expect(manager.getSelectedPoints()).toEqual([]);
    expect(manager._snapshot).toBeNull();
  });
});