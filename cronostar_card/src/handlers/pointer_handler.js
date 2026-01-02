/** * Pointer/touch event handling for area selection * @module pointer-handler */
import { Logger } from '../utils.js';
import { TIMEOUTS } from '../config.js';

export class PointerHandler {
  constructor(card) {
    this.card = card;
    this.isSelecting = false;
    this.pendingSelectStart = null; // start position before threshold exceeded
    this.isGlobalDragging = false;
    this.globalDragStartPx = null;
    this.initialDragValues = new Map();
    this.selStartPx = null;
    this.selEndPx = null;
    this.activePointerId = null;
    this.selectionAdditive = false;
    this.longPressTimeout = null;
    this.dragThresholdPx = 6; // pixels before turning into area selection

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerCancel = this.onPointerCancel.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
  }

  /**
   * Handle context menu (right click)
   */
  onContextMenu(e) {
    e.preventDefault();

    // Alt + Right Click Alignment logic
    if (e.altKey) {
      e.stopPropagation();
      this.card.stateManager.alignSelectedPoints('right');
      this.card.chartManager?._updatePointStyles();
      return;
    }

    // If multiple points are selected, always show menu to allow batch operations
    const selectedCount = this.card.selectionManager?.getSelectedPoints().length || 0;
    
    if (selectedCount <= 1) {
      // Attempt to delete a point on right-click (fast delete for single point)
      if (this.card.chartManager?.deletePointAtEvent?.(e)) {
        return; // Point was deleted, do not show context menu
      }
    }

    const pos = this.getContainerRelativeCoords(e);
    this.showContextMenu(pos.x, pos.y);
  }

  showContextMenu(x, y) {
    const container = this.card.shadowRoot?.querySelector(".chart-container");
    let finalX = x;
    let finalY = y;

    if (container) {
      const rect = container.getBoundingClientRect();
      const menuWidth = 160; // Approximate
      const menuHeight = 200; // Approximate

      if (x + menuWidth > rect.width) {
        finalX = x - menuWidth;
      }
      if (y + menuHeight > rect.height) {
        finalY = y - menuHeight;
      }
    }

    this.card.contextMenu = { show: true, x: Math.max(5, finalX), y: Math.max(5, finalY) };
    this.card.requestUpdate();

    // Close menu on next click
    const closeMenu = () => {
      this.card.contextMenu = { ...this.card.contextMenu, show: false };
      this.card.requestUpdate();
      document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
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
    el.style.width = `${Math.max(2, maxX - minX)}px`;
    el.style.height = `${Math.max(2, maxY - minY)}px`;
  }

  /**
   * Handle pointer down event
   */
  onPointerDown(e) {
    try {
      // Ignore pointer selection while a chart drag is in progress
      if (this.card?.isDragging) {
        Logger.log('POINTER', 'onPointerDown ignored: isDragging');
        return;
      }

      const pos = this.getContainerRelativeCoords(e);

      // AXIS CHECK: If the click starts on an axis area, ignore it here
      // to let Chart.js panning handle it.
      const chart = this.card.chartManager?.getChart();
      if (chart) {
        const { x, y } = chart.scales;
        if (pos.y >= x.top || pos.x <= y.right) {
          Logger.log('POINTER', 'onPointerDown ignored: axis area');
          return;
        }
      }

      // Defer selection start until movement exceeds threshold
      this.pendingSelectStart = pos;
      this.selStartPx = null;
      this.selEndPx = null;
      this.activePointerId = e.pointerId;
      this.isSelecting = false;

      // Long press detection
      if (this.longPressTimeout) clearTimeout(this.longPressTimeout);
      this.longPressTimeout = setTimeout(() => {
        if (!this.isSelecting && !this.card.isDragging) {
          this.showContextMenu(pos.x, pos.y);
        }
      }, 500);

      // Do not mark pointerSelecting yet; allow click selection to proceed if no drag
      this.card.selectionJustCompletedAt = 0;
      this.selectionAdditive = !!(e.ctrlKey || e.metaKey || e.shiftKey);
    } catch (err) {
      Logger.warn('POINTER', 'onPointerDown failed:', err);
    }
  }

  /**
   * Handle pointer move event
   */
  onPointerMove(e) {
    try {
      if (e.pointerId !== this.activePointerId && this.activePointerId !== null) return;
      const pos = this.getContainerRelativeCoords(e);

      if (this.isSelecting) {
        // Update selection rectangle
        this.selEndPx = pos;
        this.updateSelectionOverlay();
        // Prevent browser defaults (scrolling, etc) during selection
        if (e.cancelable) e.preventDefault();
        return;
      }

      // Ignore area selection while chart drag is active
      if (this.card?.isDragging) return;

      if (!this.isSelecting) {
        // Check if movement exceeded threshold to start area selection
        if (this.pendingSelectStart) {
          const dx = pos.x - this.pendingSelectStart.x;
          const dy = pos.y - this.pendingSelectStart.y;
          if (Math.sqrt(dx * dx + dy * dy) >= this.dragThresholdPx) {
            if (this.longPressTimeout) clearTimeout(this.longPressTimeout);
            // Begin selection
            this.isSelecting = true;
            this.card.pointerSelecting = true;
            this.selStartPx = { ...this.pendingSelectStart };
            this.selEndPx = { ...pos };
            
            // Capture pointer to ensure we get events even outside the canvas
            if (e.target && typeof e.target.setPointerCapture === 'function') {
              try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            
            this.showSelectionOverlay();
          }
        }
      }
    } catch (err) {
      Logger.warn('POINTER', 'onPointerMove failed:', err);
    }
  }

  /**
   * Handle pointer up event
   */
  onPointerUp(e) {
    if (this.longPressTimeout) clearTimeout(this.longPressTimeout);
    try {
      if (e.pointerId !== this.activePointerId && this.activePointerId !== null) return;
      
      // Release pointer capture if we were selecting
      if (this.isSelecting && e.target && typeof e.target.releasePointerCapture === 'function') {
        try { e.target.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }

      // Ignore pointer up selection completion while chart drag is active
      if (this.card?.isDragging && !this.isSelecting) {
        this.activePointerId = null;
        this.pendingSelectStart = null;
        this.selStartPx = null;
        this.selEndPx = null;
        this.card.pointerSelecting = false;
        this.hideSelectionOverlay();
        Logger.log('POINTER', 'onPointerUp ignored: isDragging');
        return;
      }
      
      this.activePointerId = null;

      // If no selection started (click), do not interfere; reset state and exit
      if (!this.isSelecting) {
        this.pendingSelectStart = null;
        this.selStartPx = null;
        this.selEndPx = null;
        this.card.pointerSelecting = false;
        this.hideSelectionOverlay();
        return;
      }

      // Complete area selection
      const minX = Math.min(this.selStartPx.x, this.selEndPx.x);
      const minY = Math.min(this.selStartPx.y, this.selEndPx.y);
      const maxX = Math.max(this.selStartPx.x, this.selEndPx.x);
      const maxY = Math.max(this.selStartPx.y, this.selEndPx.y);

      // Compute selected indices from area (delegated to ChartManager)
      const indices = this.card.chartManager?.getIndicesInArea?.(minX, minY, maxX, maxY) || [];

      const selMgr = this.card.selectionManager;
      const chartMgr = this.card.chartManager;

      if (indices.length > 0) {
        if (this.selectionAdditive) {
          const union = [...selMgr.getSelectedPoints()];
          indices.forEach((i) => { if (!union.includes(i)) union.push(i); });
          selMgr.selectIndices(union, true);
        } else {
          selMgr.selectIndices(indices, true);
        }
      } else {
        selMgr.clearSelection();
      }

      chartMgr.updatePointStyles?.(); // Use new consistent method name if available
      if (chartMgr.update) chartMgr.update();
      selMgr.logSelection('area selection completed');

      // Suppress immediate click after selection
      this.card.selectionJustCompletedAt = Date.now();
      this.card.suppressClickUntil = Date.now() + TIMEOUTS.clickSuppression;

      this.hideSelectionOverlay();

      // Reset selection state
      this.isSelecting = false;
      this.card.pointerSelecting = false;
      this.pendingSelectStart = null;
      this.selStartPx = null;
      this.selEndPx = null;
    } catch (err) {
      Logger.warn('POINTER', 'onPointerUp failed:', err);
    }
  }

  /**
   * Handle pointer cancel event
   */
  onPointerCancel() {
    if (!this.isSelecting) return;
    this.isSelecting = false;
    this.activePointerId = null;
    this.card.pointerSelecting = false;
    this.pendingSelectStart = null;
    this.selStartPx = null;
    this.selEndPx = null;
    this.hideSelectionOverlay();
    this.card.suppressClickUntil = Date.now() + 300;
  }

  /**
   * Attach pointer listeners
   * @param {HTMLCanvasElement} canvas - Canvas element
   */
  attachListeners(canvas) {
    canvas.addEventListener('pointerdown', this.onPointerDown, { passive: false, capture: true });
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false, capture: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: false, capture: true });
    window.addEventListener('pointercancel', this.onPointerCancel, { passive: false, capture: true });
  }

  /**
   * Detach pointer listeners
   * @param {HTMLCanvasElement} canvas - Canvas element
   */
  detachListeners(canvas) {
    canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove, { capture: true });
    window.removeEventListener('pointerup', this.onPointerUp, { capture: true });
    window.removeEventListener('pointercancel', this.onPointerCancel, { capture: true });
  }
}
