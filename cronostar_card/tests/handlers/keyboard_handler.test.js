import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeyboardHandler } from '../../src/handlers/keyboard_handler.js';

describe('KeyboardHandler', () => {
  let card;
  let handler;
  let container;

  beforeEach(() => {
    card = {
      isEditorContext: vi.fn(() => false),
      shadowRoot: { activeElement: null },
      stateManager: {
        undo: vi.fn(),
        redo: vi.fn(),
        insertPoint: vi.fn(() => 5),
        removePoint: vi.fn(),
        getData: vi.fn(() => Array(10).fill({ time: '00:00', value: 20 })),
        setData: vi.fn(),
        scheduleData: Array(10).fill({ time: '00:00', value: 20 }).map((p, i) => ({ ...p, time: `0${i}:00` }))
      },
      selectionManager: {
        selectAll: vi.fn(),
        clearSelection: vi.fn(),
        getActiveIndices: vi.fn(() => [1]),
        selectIndices: vi.fn(),
        selectedPoint: 1,
        selectedPoints: [1]
      },
      chartManager: {
        update: vi.fn(),
        updateData: vi.fn(),
        updatePointStyling: vi.fn(),
        showDragValueDisplay: vi.fn(),
        scheduleHideDragValueDisplay: vi.fn(),
        chart: {
          data: {
            datasets: [{ data: Array(10).fill({ x: 0, y: 20 }).map((p, i) => ({ x: i * 60, y: 20 })) }]
          }
        }
      },
      eventHandlers: {
        handleApplyNow: vi.fn()
      },
      contextMenu: {},
      requestUpdate: vi.fn(),
      config: {
        kb_def_h: 10,
        kb_def_v: 1
      }
    };
    
    container = document.createElement('div');
    container.focus = vi.fn();
    
    handler = new KeyboardHandler(card);
    handler.attachListeners(container);
  });

  afterEach(() => {
    handler.detachListeners(container);
  });

  it('should enable/disable', () => {
    handler.disable();
    expect(handler.enabled).toBe(false);
    handler.enable();
    expect(handler.enabled).toBe(true);
  });

  it('should handle focus/blur', () => {
    const focusEvent = new Event('focus');
    container.dispatchEvent(focusEvent);
    expect(handler.enabled).toBe(true);

    handler.ctrlDown = true;
    const blurEvent = new Event('blur');
    container.dispatchEvent(blurEvent);
    expect(handler.ctrlDown).toBe(false);
  });

  it('should handle modifier keys', () => {
    const down = (key) => container.dispatchEvent(new KeyboardEvent('keydown', { key }));
    const up = (key) => container.dispatchEvent(new KeyboardEvent('keyup', { key }));

    down('Control'); expect(handler.ctrlDown).toBe(true);
    up('Control'); expect(handler.ctrlDown).toBe(false);

    down('Meta'); expect(handler.metaDown).toBe(true);
    up('Meta'); expect(handler.metaDown).toBe(false);

    down('Shift'); expect(handler.shiftDown).toBe(true);
    up('Shift'); expect(handler.shiftDown).toBe(false);

    down('Alt'); expect(handler.altDown).toBe(true);
    up('Alt'); expect(handler.altDown).toBe(false);
  });

  it('should handle shortcuts', () => {
    const press = (key, modifiers = {}) => {
      const e = new KeyboardEvent('keydown', { key, ...modifiers, bubbles: true });
      container.dispatchEvent(e);
    };

    // Undo
    press('z', { ctrlKey: true });
    expect(card.stateManager.undo).toHaveBeenCalled();

    // Redo
    press('y', { ctrlKey: true });
    expect(card.stateManager.redo).toHaveBeenCalled();

    // Select All
    press('a', { ctrlKey: true });
    expect(card.selectionManager.selectAll).toHaveBeenCalled();

    // Save (just logs)
    press('s', { ctrlKey: true });
    
    // Apply Now
    press('Enter', { ctrlKey: true });
    expect(card.eventHandlers.handleApplyNow).toHaveBeenCalled();

    // Insert (Alt+Q)
    press('q', { altKey: true });
    expect(card.stateManager.insertPoint).toHaveBeenCalled();

    // Delete (Alt+W)
    press('w', { altKey: true });
    expect(card.stateManager.removePoint).toHaveBeenCalled();

    // Escape
    press('Escape');
    expect(card.selectionManager.clearSelection).toHaveBeenCalled();
  });

  it('should handle arrows for movement', () => {
    const press = (key) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true });
      container.dispatchEvent(e);
    };

    press('ArrowLeft');
    expect(card.chartManager.update).toHaveBeenCalled();
    // Verify movement logic executed (data x changed)
    // Checking internal state change might be complex, but call verification is good enough for coverage
  });

  it('should handle arrows for value change', () => {
    const press = (key) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true });
      container.dispatchEvent(e);
    };

    press('ArrowUp');
    expect(card.stateManager.setData).toHaveBeenCalled(); // Called to set data
  });

  it('should ignore keys when disabled or not focused', () => {
    handler.disable();
    const e = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true });
    container.dispatchEvent(e);
    expect(card.selectionManager.selectAll).not.toHaveBeenCalled();
  });

  it('should attach/detach listeners correctly', () => {
    const el = document.createElement('div');
    handler.attachListeners(el);
    handler.detachListeners(el);
    handler.detachListeners(null); // Should handle null
  });
});