import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyboardHandler } from '../../src/handlers/keyboard_handler.js';

describe('KeyboardHandler', () => {
  let card;
  let handler;

  beforeEach(() => {
    card = {
      config: { step_value: 0.5 },
      selectionManager: {
        getActiveIndices: vi.fn(() => []),
        getSelectedPoints: vi.fn(() => []),
        clearSelection: vi.fn()
      },
      stateManager: {
        undo: vi.fn(),
        redo: vi.fn(),
        getData: vi.fn(() => [])
      },
      chartManager: {
        updateData: vi.fn(),
        update: vi.fn(),
        updatePointStyling: vi.fn(),
        scheduleHideDragValueDisplay: vi.fn()
      },
      eventHandlers: {
        handleApplyNow: vi.fn()
      },
      requestUpdate: vi.fn()
    };
    handler = new KeyboardHandler(card);
  });

  it('should enable and disable', () => {
    handler.disable();
    expect(handler.enabled).toBe(false);
    handler.enable();
    expect(handler.enabled).toBe(true);
  });

  it('should handle undo/redo shortcuts', () => {
    const event = { 
      key: 'z', 
      ctrlKey: true, 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn() 
    };
    handler.handleKeydown(event);
    expect(card.stateManager.undo).toHaveBeenCalled();
  });

  it('should handle select all shortcut', () => {
    card.selectionManager.selectAll = vi.fn();
    const event = { 
      key: 'a', 
      ctrlKey: true, 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn() 
    };
    handler.handleKeydown(event);
    expect(card.selectionManager.selectAll).toHaveBeenCalled();
  });

  it('should handle Escape key', () => {
    const event = { 
      key: 'Escape', 
      preventDefault: vi.fn(), 
      stopPropagation: vi.fn() 
    };
    handler.handleKeydown(event);
    expect(card.selectionManager.clearSelection).toHaveBeenCalled();
  });
});
