/** * Pointer/touch event handling for area selection * @module pointer-handler */

import { Logger } from '../utils.js';
import { TIMEOUTS } from '../config.js';

export class PointerHandler {
  constructor(card) {
    this.card = card;
    this.isSelecting = false;
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
    const points = chartMgr?.chart?.getElementsAtEventForMode?.(e, 'nearest', { intersect: true }, true) || [];
    const clickOnPoint = points.length > 0;

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