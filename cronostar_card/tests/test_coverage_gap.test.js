// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { CronoStarEditor } from '../src/editor/CronoStarEditor.js';
import { PointerHandler } from '../src/handlers/pointer_handler.js';

describe('Coverage Gap Filler', () => {
  describe('CronoStarEditor', () => {
    it('should set config', () => {
      const editor = new CronoStarEditor();
      editor.setConfig({ type: 'foo' });
      expect(editor._config.type).toBe('foo');
    });
    
    it('should fire config-changed event', () => {
      const editor = new CronoStarEditor();
      const spy = vi.fn();
      editor.addEventListener('config-changed', spy);
      editor._config = {};
      editor._dispatchConfigChanged(true);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('PointerHandler', () => {
    it('should handle pointer events', () => {
      const card = {
        isDragging: false,
        pointerSelecting: false,
        chartManager: { getChart: vi.fn(), deletePointAtEvent: vi.fn(), isInitialized: vi.fn(() => true) },
        selectionManager: { getSelectedPoints: vi.fn(() => []), selectPoint: vi.fn(), clearSelection: vi.fn() },
        stateManager: { removePoint: vi.fn() },
        shadowRoot: { querySelector: vi.fn() },
        requestUpdate: vi.fn()
      };
      const handler = new PointerHandler(card);
      
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), pointerId: 1, clientX: 10, clientY: 10 };
      handler.onPointerDown(e);
      handler.onPointerMove(e);
      handler.onPointerUp(e);
      handler.onContextMenu(e);
      
      expect(card.chartManager.deletePointAtEvent).toHaveBeenCalled();
    });
  });
});
