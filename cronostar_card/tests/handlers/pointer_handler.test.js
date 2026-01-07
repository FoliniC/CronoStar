import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PointerHandler } from '../../src/handlers/pointer_handler.js';

describe('PointerHandler', () => {
  let card;
  let handler;

  beforeEach(() => {
    card = {
      selectionManager: {
        clearSelection: vi.fn(),
        selectIndices: vi.fn(),
        logSelection: vi.fn(),
        getSelectedPoints: vi.fn(() => [])
      },
      chartManager: {
        getChart: vi.fn(() => ({ 
          scales: { x: { top: 100 }, y: { right: 10 } } 
        })),
        getIndicesInArea: vi.fn(() => [1, 2]),
        updatePointStyles: vi.fn(),
        update: vi.fn()
      },
      requestUpdate: vi.fn(),
      shadowRoot: {
        getElementById: vi.fn(() => ({ style: {} })),
        querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }))
      }
    };
    handler = new PointerHandler(card);
  });

  it('should handle context menu prevent default', () => {
    const event = { preventDefault: vi.fn(), clientX: 50, clientY: 50 };
    handler.onContextMenu(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should start selection on pointer down', () => {
    // Coordinate (50,50) is inside valid area (top=100, right=100 in chart scales mock)
    const event = { 
      clientX: 50, 
      clientY: 50, 
      pointerId: 1,
      ctrlKey: false
    };
    handler.onPointerDown(event);
    expect(handler.pendingSelectStart).toEqual({ x: 50, y: 50 });
  });

  it('should handle selection box on pointer move', () => {
    handler.pendingSelectStart = { x: 0, y: 0 };
    const event = { clientX: 20, clientY: 20, pointerId: 1, target: {} };
    handler.onPointerMove(event);
    expect(handler.isSelecting).toBe(true);
    expect(card.shadowRoot.getElementById).toHaveBeenCalledWith('selection-rect');
  });

  it('should complete selection on pointer up', () => {
    handler.isSelecting = true;
    handler.selStartPx = { x: 0, y: 0 };
    handler.selEndPx = { x: 50, y: 50 };
    const event = { pointerId: 1, target: {} };
    
    handler.onPointerUp(event);
    
    expect(card.selectionManager.selectIndices).toHaveBeenCalledWith([1, 2], true);
    expect(handler.isSelecting).toBe(false);
  });
});
