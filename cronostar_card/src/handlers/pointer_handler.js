/** * Pointer/touch event handling for area selection * @module pointer-handler */

import { Logger } from '../utils.js';
import { TIMEOUTS } from '../config.js';

export class PointerHandler {
  constructor(card) {
    this.card = card;
    this.isSelecting = false;
    this.isGlobalDragging = false;
    this.globalDragStartPx = null;
    this.initialDragValues = new Map();
    this.selStartPx = null;
    this.selEndPx = null;
    this.activePointerId = null;
    this.selectionAdditive = false;
    this.longPressTimeout = null;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);
  }

  /**
   * Get container-relative coordinates
   * @param {PointerEvent} e - Pointer event
   * @returns {Object} {x, y}
   */
  getContainerRelativeCoords(e) {
    const container = this.card.shadowRoot?.querySelector(".chart-container");
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  /**
   * Show selection overlay
   */
  showSelectionOverlay() {
    const el = this.card.shadowRoot?.getElementById('selection-rect');
    if (!el) return;
    el.style.display = 'block';
    this.updateSelectionOverlay();
  }

  /**
   * Hide selection overlay
   */
  hideSelectionOverlay() {
    const el = this.card.shadowRoot?.getElementById('selection-rect');
    if (!el) return;
    el.style.display = 'none';
  }

  /**
   * Update selection overlay position and size
   */
  updateSelectionOverlay() {
    const el = this.card.shadowRoot?.getElementById('selection-rect');
    if (!el || !this.selStartPx || !this.selEndPx) return;

    const minX = Math.min(this.selStartPx.x, this.selEndPx.x);
    const minY = Math.min(this.selStartPx.y, this.selEndPx.y);
    const maxX = Math.max(this.selStartPx.x, this.selEndPx.x);
    const maxY = Math.max(this.selStartPx.y, this.selEndPx.y);

    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${Math.max(0, maxX - minX)}px`;
    el.style.height = `${Math.max(0, maxY - minY)}px`;
  }

  /**
   * Get indices within current selection rectangle
   * @returns {Array<number>}
   */
  getIndicesInSelectionRect() {
    const chartMgr = this.card.chartManager;
    if (!chartMgr?.chart || !this.selStartPx || !this.selEndPx) return [];

    const meta = chartMgr.chart.getDatasetMeta(0);
    if (!meta?.data) return [];

    const container = this.card.shadowRoot?.querySelector(".chart-container");
    const canvas = this.card.shadowRoot?.getElementById("myChart");
    if (!container || !canvas) return [];

    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const offsetX = canvasRect.left - containerRect.left;
    const offsetY = canvasRect.top - containerRect.top;

    const minX = Math.min(this.selStartPx.x, this.selEndPx.x);
    const minY = Math.min(this.selStartPx.y, this.selEndPx.y);
    const maxX = Math.max(this.selStartPx.x, this.selEndPx.x);
    const maxY = Math.max(this.selStartPx.y, this.selEndPx.y);

    const inside = [];
    meta.data.forEach((elem, idx) => {
      const pos = typeof elem.tooltipPosition === 'function'
        ? elem.tooltipPosition()
        : { x: elem.x, y: elem.y };
      const px = pos.x + offsetX;
      const py = pos.y + offsetY;

      if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
        inside.push(idx);
      }
    });

    Logger.sel(`Area selection: nodes in rectangle -> ${JSON.stringify(inside)}`);
    return inside;
  }

  /**
   * Handle pointer down event
   * @param {PointerEvent} e - Pointer event
   */
  onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Check if click is strictly within chart area (axes check)
    const chart = this.card.chartManager?.chart;
    if (chart) {
        const { scales } = chart;
        const rect = chart.canvas.getBoundingClientRect();
        
        let clientX = e.clientX;
        let clientY = e.clientY;
        if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        }
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        // If click is on axes/labels (outside plot area), return early to allow pan/zoom
        if (scales && scales.x && scales.y) {
            if (x < scales.x.left || x > scales.x.right || y < scales.y.top || y > scales.y.bottom) {
                 return; 
            }
        }
    }

    // Long-press for touch to enable multi-select
    if (e.pointerType === 'touch') {
      const chartMgr = this.card.chartManager;
      const points = chartMgr?.chart?.getElementsAtEventForMode?.(e, 'nearest', { intersect: true }, true) || [];
      if (points.length > 0) {
        this.longPressTimeout = setTimeout(() => {
          this.card.wasLongPress = true;
          const selMgr = this.card.selectionManager;
          const index = points[0].index;
          selMgr.toggleIndexSelection(index);
          chartMgr.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
          chartMgr.update();
          this.longPressTimeout = null;
        }, 500); // 500ms for long press
      }
    }

    const chartMgr = this.card.chartManager;
    // Enhanced hit testing: Try strict intersect first, then fallback to nearest with distance check
    let points = chartMgr?.chart?.getElementsAtEventForMode?.(e, 'nearest', { intersect: true }, true) || [];
    
    if (points.length === 0 && chartMgr?.chart) {
        const nearest = chartMgr.chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, true) || [];
        if (nearest.length > 0) {
            const p = nearest[0];
            const pEl = p.element;
            const rect = chartMgr.chart.canvas.getBoundingClientRect();
            
            let clientX = e.clientX;
            let clientY = e.clientY;
            if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            }
            
            const clickX = clientX - rect.left;
            const clickY = clientY - rect.top;
            
            // Calculate distance to the nearest point center
            const dx = clickX - pEl.x;
            const dy = clickY - pEl.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Use a generous threshold (20px) to catch "near misses" that dragData might catch
            if (dist < 20) {
                points = [p];
            }
        }
    }

    const clickOnPoint = points.length > 0;

    // Global drag for Android/touch
    if (!clickOnPoint && e.pointerType === 'touch' && this.card.selectionManager.selectedPoints.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      this.isGlobalDragging = true;
      this.activePointerId = e.pointerId;
      const { x, y } = this.getContainerRelativeCoords(e);
      this.globalDragStartPx = { x, y };

      const chart = this.card.chartManager.chart;
      const selMgr = this.card.selectionManager;
      const selectedIndices = selMgr.getSelectedPoints();
      const dataset = chart.data.datasets[0];

      this.initialDragValues.clear();
      selectedIndices.forEach(index => {
        this.initialDragValues.set(index, dataset.data[index]);
      });

      Logger.log('DRAG', `[Pointer] Initiating global drag for ${selectedIndices.length} points.`);
      
      const canvas = this.card.shadowRoot?.getElementById("myChart");
      try {
        canvas?.setPointerCapture(e.pointerId);
      } catch (err) {}
      
      return;
    }

    // Single point click selection/toggle (no Shift)
    if (clickOnPoint && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      const index = points[0].index;
      const selMgr = this.card.selectionManager;

      // Ctrl/Cmd toggles, otherwise single selection
      if (this.card.keyboardHandler?.ctrlDown || this.card.keyboardHandler?.metaDown || e.ctrlKey || e.metaKey) {
        selMgr.toggleIndexSelection(index);
      } else {
        selMgr.selectIndices([index], false);
      }

      chartMgr.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
      chartMgr.update();

      this.card.suppressClickUntil = Date.now() + TIMEOUTS.clickSuppression;
      return;
    }

    const shouldSelectArea = !!e.shiftKey || !clickOnPoint;
    if (!shouldSelectArea) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    this.isSelecting = true;
    this.activePointerId = e.pointerId;
    this.selectionAdditive = !!(
      this.card.keyboardHandler?.ctrlDown ||
      this.card.keyboardHandler?.metaDown ||
      e.ctrlKey ||
      e.metaKey
    );

    const canvas = this.card.shadowRoot?.getElementById("myChart");
    try {
      canvas?.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore capture errors
    }

    const { x, y } = this.getContainerRelativeCoords(e);
    this.selStartPx = { x, y };
    this.selEndPx = { x, y };
    this.showSelectionOverlay();

    this.card.suppressClickUntil = Date.now() + TIMEOUTS.clickSuppression;
  }

  /**
   * Handle pointer move event
   * @param {PointerEvent} e - Pointer event
   */
  onPointerMove(e) {
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }

    if (this.isGlobalDragging) {
      if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
      e.preventDefault();
      
      const chart = this.card.chartManager.chart;
      const yAxis = chart.scales.y;
      const { y } = this.getContainerRelativeCoords(e);
      
      const startValue = yAxis.getValueForPixel(this.globalDragStartPx.y);
      const currentValue = yAxis.getValueForPixel(y);
      const valueDelta = currentValue - startValue;

      const selMgr = this.card.selectionManager;
      const selectedIndices = selMgr.getSelectedPoints();
      const dataset = chart.data.datasets[0];
      const { min_value, max_value, step_value } = this.card.config;

      selectedIndices.forEach(index => {
        const initialValue = this.initialDragValues.get(index);
        let newValue = initialValue + valueDelta;
        
        // Clamp and round to step
        newValue = Math.max(min_value, Math.min(max_value, newValue));
        newValue = Math.round(newValue / step_value) * step_value;
        
        dataset.data[index] = newValue;
      });

      this.card.chartManager.update('none'); // Update without animation
      return;
    }

    if (!this.isSelecting) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    e.preventDefault();
    const pos = this.getContainerRelativeCoords(e);
    this.selEndPx = pos;
    this.updateSelectionOverlay();
  }

  /**
   * Handle pointer up event
   * @param {PointerEvent} e - Pointer event
   */
  onPointerUp(e) {
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }

    if (this.isGlobalDragging) {
      if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
      e.preventDefault();
      
      this.isGlobalDragging = false;
      this.activePointerId = null;
      this.initialDragValues.clear();

      const canvas = this.card.shadowRoot?.getElementById("myChart");
      try {
        canvas?.releasePointerCapture(e.pointerId);
      } catch (err) {}

      this.card.hasUnsavedChanges = true;
      this.card.requestUpdate();

      // Trigger auto-save
      if (this.card.selectedProfile) {
          this.card.profileManager.saveProfile(this.card.selectedProfile)
              .catch(err => Logger.error('DRAG', 'Global drag auto-save failed:', err));
      }
      
      Logger.log('DRAG', '[Pointer] Global drag finished.');
      return;
    }

    if (this.card.wasLongPress) {
      this.card.wasLongPress = false; // Reset for next click
      // Prevent chart's own click handler from firing
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }

    if (!this.isSelecting) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    this.isSelecting = false;
    this.activePointerId = null;

    const canvas = this.card.shadowRoot?.getElementById("myChart");
    try {
      canvas?.releasePointerCapture(e.pointerId);
    } catch (err) {
      // Ignore release errors
    }

    this.hideSelectionOverlay();

    const indices = this.getIndicesInSelectionRect();
    const selMgr = this.card.selectionManager;
    const chartMgr = this.card.chartManager;

    if (indices.length > 0) {
      if (this.selectionAdditive) {
        const union = [...selMgr.getSelectedPoints()];
        indices.forEach(i => {
          if (!union.includes(i)) union.push(i);
        });
        selMgr.selectIndices(union, true);
      } else {
        selMgr.selectIndices(indices, true);
      }
    } else {
      selMgr.clearSelection();
    }

    chartMgr.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
    chartMgr.update();
    selMgr.logSelection("area selection completed");

    this.card.suppressClickUntil = Date.now() + TIMEOUTS.clickSuppression;
  }

  /**
   * Handle pointer cancel event
   */
  onPointerCancel() {
    if (!this.isSelecting) return;
    this.isSelecting = false;
    this.activePointerId = null;
    this.hideSelectionOverlay();
    this.card.suppressClickUntil = Date.now() + 300;
  }

  /**
   * Attach pointer listeners
   * @param {HTMLCanvasElement} canvas - Canvas element
   */
  attachListeners(canvas) {
    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: false, capture: true });
    window.addEventListener('pointermove', this.onPointerMove, true);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('pointercancel', this.onPointerCancel, true);
  }

  /**
   * Detach pointer listeners
   * @param {HTMLCanvasElement} canvas - Canvas element
   */
  detachListeners(canvas) {
    canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.removeEventListener('pointermove', this.onPointerMove, true);
    window.removeEventListener('pointerup', this.onPointerUp, true);
    window.removeEventListener('pointercancel', this.onPointerCancel, true);
  }
}  