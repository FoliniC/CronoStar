/** Chart Manager for CronoStar Card with Dynamic Points */
import Chart from 'chart.js/auto';
import dragDataPlugin from 'chartjs-plugin-dragdata';
import zoomPlugin from 'chartjs-plugin-zoom';
import { COLORS } from '../config.js';
import { Logger } from '../utils.js';

Chart.register(dragDataPlugin, zoomPlugin);

export class ChartManager {
  constructor(card) {
    this.card = card;
    this.chart = null;
    this._initialized = false;
    this.lastMousePosition = null;
    // Remove custom resize handler to avoid redundant Chart.js resizes
    // Chart.js responsive:true already handles window resize efficiently
    // this._boundHandleResize = this._handleResize.bind(this);
    this._dragDisplayTimer = null;
    this._hoverHideTimer = null;

    // Manual horizontal drag state (NO_CROSSING)
    this._hDragActive = false;
    this._hDragPointerId = null;
    this._hDragStartClient = null;
    this._hDragStartedAt = 0;
    this._boundOnWindowPointerMove = this._onWindowPointerMove.bind(this);
    this._boundOnWindowPointerUp = this._onWindowPointerUp.bind(this);
  }

  _onWindowPointerMove(e) {
    try {
      if (!this._hDragActive) return;
      if (this._hDragPointerId !== null && e.pointerId !== this._hDragPointerId) return;
      if (!this.chart) return;
      if (this.card.pointerSelecting) return;

      const dsIndex = this.dragDatasetIndex;
      const activeIndex = this.dragActiveIndex;
      if (dsIndex === null || dsIndex === undefined) return;
      if (activeIndex === null || activeIndex === undefined) return;

      const dataset = this.chart.data.datasets[dsIndex];
      if (!dataset?.data?.length) return;

      const xScale = this.chart.scales?.x;
      if (!xScale) return;

      // Check if we're dragging first or last point by time
      const allByTime = dataset.data
        .map((pt, idx) => ({ idx, x: Math.round(Number(pt?.x ?? 0)) }))
        .sort((a, b) => a.x - b.x);
      const firstIdx = allByTime[0]?.idx;
      const lastIdx = allByTime[allByTime.length - 1]?.idx;

      const canvasRect = this.chart.canvas.getBoundingClientRect();
      const pxX = e.clientX - canvasRect.left;
      let minutes = xScale.getValueForPixel(pxX);
      if (!Number.isFinite(minutes)) return;

      let snapMinutes = Number(this.card.config?.keyboard_time_step_minutes) || 5;
      if (e.altKey) {
        snapMinutes = 30;
      } else if (e.ctrlKey || e.metaKey) {
        snapMinutes = 1;
      }

      minutes = Math.round(minutes / snapMinutes) * snapMinutes;

      // Apply NO_CROSSING constraints for active point
      const boundsActive = this.dragBounds?.[activeIndex] || { left: 0, right: 1440 };
      const clampedActive = Math.max(boundsActive.left, Math.min(boundsActive.right, minutes));
      const dxMinutes = clampedActive - Math.round(Number(this.initialSelectedX?.[activeIndex] ?? this.dragStartX ?? 0));

      const pointsToMove = Array.isArray(this.dragSelectedPoints) && this.dragSelectedPoints.length
        ? this.dragSelectedPoints
        : [activeIndex];

      pointsToMove.forEach((i) => {
        const p = dataset.data[i];
        if (!p) return;

        // Block horizontal movement for first and last points
        if (i === firstIdx || i === lastIdx) {
          return; // Don't move horizontally
        }

        const origX = this.initialSelectedX?.[i];
        if (origX === undefined) return;
        const bounds = this.dragBounds?.[i] || { left: 0, right: 1440 };
        let desiredX = Math.round(Number(origX) + dxMinutes);
        let newX = Math.max(bounds.left, Math.min(bounds.right, desiredX));
        newX = Math.max(0, Math.min(1440, newX));
        p.x = newX;
      });

      this.chart.update('none');
    } catch { }
  }

  _onWindowPointerUp(e) {
    try {
      if (!this._hDragActive) return;
      if (this._hDragPointerId !== null && e.pointerId !== this._hDragPointerId) return;
      this._hDragActive = false;
      this._hDragPointerId = null;
      this._hDragStartClient = null;
      this._hDragStartedAt = 0;
      window.removeEventListener('pointermove', this._boundOnWindowPointerMove, true);
      window.removeEventListener('pointerup', this._boundOnWindowPointerUp, true);

      // Commit to StateManager
      try {
        const dsIndex = this.dragDatasetIndex ?? 0;
        const dataset = this.chart?.data?.datasets?.[dsIndex];
        if (dataset?.data?.length) {
          const newData = dataset.data.map((p) => {
            const minutes = Math.max(0, Math.min(1440, Number(p.x)));
            return { time: this.card.stateManager.minutesToTime(minutes), value: p.y };
          });
          this.card.stateManager.setData(newData);
          this.card.hasUnsavedChanges = true;
        }
      } catch { }

      // Reset drag flags
      this.card.isDragging = false;
      this.dragDatasetIndex = null;
      this.dragActiveIndex = null;
    } catch { }
  }

  isInitialized() {
    return this._initialized && !!this.chart;
  }

  getChart() {
    return this.chart;
  }

  _getXTitle() {
    return this.card.config?.x_axis_label ||
      this.card.localizationManager?.localize(this.card.language, 'ui.hours_label') || 'Hours';
  }

  _getYTitle() {
    return this.card.config?.y_axis_label ||
      this.card.localizationManager?.localize(this.card.language, 'ui.temperature_label') || 'Temp';
  }

  // _handleResize() {
  //   // Redundant with Chart.js responsive handling; left commented for future manual control
  //   if (this.chart) {
  //     this.chart.resize();
  //   }
  // }

  // Safe wrapper used across handlers (keyboard/pointer)
  update(mode = 'none') {
    if (!this.chart) return;
    try {
      this.chart.update(mode);
    } catch (e) {
      try {
        this.chart.update();
      } catch { }
    }
  }

  // Shows a small floating label with the current value near the last selected point
  showDragValueDisplay(indices, dataset) {
    try {
      const el = this.card.shadowRoot?.getElementById('drag-value-display');
      if (!el || !this.chart) return;

      const idx = Array.isArray(indices) && indices.length ? indices[indices.length - 1] : null;
      if (idx === null) return;

      const meta = this.chart.getDatasetMeta(0);
      const pointEl = meta?.data?.[idx];
      if (!pointEl) return;

      const pos = typeof pointEl.tooltipPosition === 'function'
        ? pointEl.tooltipPosition()
        : { x: pointEl.x, y: pointEl.y };

      const container = this.card.shadowRoot?.querySelector('.chart-container');
      if (!container) return;

      const canvasRect = this.chart.canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetX = canvasRect.left - containerRect.left;
      const offsetY = canvasRect.top - containerRect.top;

      // Resolve value from dataset
      let valRaw;
      if (Array.isArray(dataset) && dataset[idx] !== undefined) {
        const d = dataset[idx];
        valRaw = (typeof d === 'object' && d !== null) ? d.y : Number(d);
      } else {
        const d = this.chart.data?.datasets?.[0]?.data?.[idx];
        valRaw = (typeof d === 'object' && d !== null) ? d.y : Number(d);
      }

      const isSwitch = !!this.card.config?.is_switch_preset;
      const uom = (this.card.config?.unit_of_measurement || '').trim();

      let text = '';
      if (Number.isFinite(valRaw)) {
        if (isSwitch) {
          const key = (Number(valRaw) >= 0.5) ? 'ui.switch_on' : 'ui.switch_off';
          text = this.card.localizationManager?.localize(this.card.language, key) ||
            ((Number(valRaw) >= 0.5) ? 'On' : 'Off');
        } else {
          const step = Number(this.card.config?.step_value);
          const decimals = Number.isFinite(step)
            ? Math.max(0, Math.min(6, (String(step).split('.')[1] || '').length))
            : 1;
          text = Number(valRaw).toFixed(decimals);
          if (uom) text += ` ${uom}`;
        }
      }

      el.textContent = text;
      el.style.left = `${Math.round(pos.x + offsetX + 8)}px`;
      el.style.top = `${Math.round(pos.y + offsetY - 28)}px`;
      el.style.display = 'block';
    } catch (e) {
      Logger.warn('CHART', 'showDragValueDisplay error:', e);
    }
  }

  scheduleHideDragValueDisplay(ms = 2000) {
    try {
      if (this._dragDisplayTimer) clearTimeout(this._dragDisplayTimer);
      this._dragDisplayTimer = setTimeout(() => {
        const el = this.card.shadowRoot?.getElementById('drag-value-display');
        if (el) el.style.display = 'none';
        this._dragDisplayTimer = null;
      }, ms);
    } catch { }
  }

  /**
   * Return indices of points inside a rectangle defined in CONTAINER coordinates.
   * @param {number} minX left bound (container px)
   * @param {number} minY top bound (container px)
   * @param {number} maxX right bound (container px)
   * @param {number} maxY bottom bound (container px)
   * @returns {number[]} indices inside area
   */
  getIndicesInArea(minX, minY, maxX, maxY) {
    try {
      if (!this.chart) return [];
      const meta = this.chart.getDatasetMeta(0);
      const points = meta?.data || [];
      if (!points.length) return [];

      const container = this.card.shadowRoot?.querySelector('.chart-container');
      if (!container) return [];
      const canvasRect = this.chart.canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetX = canvasRect.left - containerRect.left;
      const offsetY = canvasRect.top - containerRect.top;

      const inside = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (!pt) continue;
        const pos = typeof pt.tooltipPosition === 'function' ? pt.tooltipPosition() : { x: pt.x, y: pt.y };
        const x = pos.x + offsetX;
        const y = pos.y + offsetY;
        if (x >= Math.min(minX, maxX) && x <= Math.max(minX, maxX) &&
          y >= Math.min(minY, maxY) && y <= Math.max(minY, maxY)) {
          inside.push(i);
        }
      }
      return inside;
    } catch (e) {
      Logger.warn('CHART', 'getIndicesInArea error:', e);
      return [];
    }
  }

  // Safe fallback to get canvas relative position
  _getCanvasRelativePosition(evt) {
    const chart = this.chart;
    if (!chart) return { x: 0, y: 0 };
    const native = evt?.native || evt;
    let clientX, clientY;

    if (native?.touches && native.touches.length) {
      clientX = native.touches[0].clientX;
      clientY = native.touches[0].clientY;
    } else if (native?.changedTouches && native.changedTouches.length) {
      clientX = native.changedTouches[0].clientX;
      clientY = native.changedTouches[0].clientY;
    } else {
      clientX = native?.clientX;
      clientY = native?.clientY;
    }

    const rect = chart.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return { x, y };
  }

  /**
   * Interpolate Y value on the line for a given X (minutes)
   */
  _interpolateValueAtMinutes(minutes) {
    try {
      const ds = this.chart?.data?.datasets?.[0]?.data || [];
      if (!Array.isArray(ds) || ds.length === 0) return null;

      // Ensure sorted by x
      const data = [...ds].sort((a, b) => a.x - b.x);
      if (minutes <= data[0].x) return Number(data[0].y);
      if (minutes >= data[data.length - 1].x) return Number(data[data.length - 1].y);

      // Find segment
      for (let i = 0; i < data.length - 1; i++) {
        const p1 = data[i];
        const p2 = data[i + 1];
        if (minutes >= p1.x && minutes <= p2.x) {
          const dx = p2.x - p1.x;
          if (!dx) return Number(p1.y);
          const t = (minutes - p1.x) / dx;
          return Number(p1.y) + (Number(p2.y) - Number(p1.y)) * t;
        }
      }
      return Number(data[data.length - 1].y);
    } catch (e) {
      return null;
    }
  }

  /**
   * Show a floating label near the cursor with current time and interpolated value.
   */
  _showHoverInfo(evt) {
    try {
      if (!this.chart) return;
      const el = this.card.shadowRoot?.getElementById('hover-value-display');
      const container = this.card.shadowRoot?.querySelector('.chart-container');
      if (!el || !container) return;

      const pos = this._getCanvasRelativePosition(evt);
      const xScale = this.chart.scales?.x;
      const yScale = this.chart.scales?.y;
      if (!xScale || !yScale) return;

      // Only within plot area
      const insideX = pos.x >= xScale.left && pos.x <= xScale.right;
      const insideY = pos.y >= yScale.top && pos.y <= yScale.bottom;
      if (!insideX || !insideY) {
        this._hideHoverInfo();
        return;
      }

      const minutes = xScale.getValueForPixel(pos.x);
      if (!Number.isFinite(minutes)) {
        this._hideHoverInfo();
        return;
      }

      const value = this._interpolateValueAtMinutes(minutes);
      if (value === null || !Number.isFinite(value)) {
        this._hideHoverInfo();
        return;
      }

      const timeStr = this.card.stateManager.minutesToTime(minutes);
      const uom = (this.card.config?.unit_of_measurement || '').trim();
      const valueText = Number(value).toFixed(1);
      el.textContent = `${timeStr} • ${valueText}${uom ? ' ' + uom : ''}`;

      const canvasRect = this.chart.canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetX = canvasRect.left - containerRect.left;
      const offsetY = canvasRect.top - containerRect.top;

      el.style.left = `${Math.round(pos.x + offsetX + 10)}px`;
      el.style.top = `${Math.round(pos.y + offsetY - 24)}px`;
      el.style.display = 'block';

      // Auto-hide after inactivity
      if (this._hoverHideTimer) clearTimeout(this._hoverHideTimer);
      this._hoverHideTimer = setTimeout(() => this._hideHoverInfo(), 1500);
    } catch { }
  }

  _hideHoverInfo() {
    try {
      const el = this.card.shadowRoot?.getElementById('hover-value-display');
      if (el) el.style.display = 'none';
      if (this._hoverHideTimer) {
        clearTimeout(this._hoverHideTimer);
        this._hoverHideTimer = null;
      }
    } catch { }
  }

  initChart(canvas) {
    if (!canvas) {
      Logger.error('CHART', '[ChartManager] initChart: canvas is null');
      return false;
    }

    // If canvas is not yet attached to DOM, defer initialization to next frame
    try {
      if (!canvas.isConnected || !canvas.ownerDocument) {
        requestAnimationFrame(() => this.initChart(canvas));
        return false;
      }
    } catch { }

    this.destroy(); // Clean up existing

    // Event listeners
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.lastMousePosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this._showHoverInfo(e);
    });

    canvas.addEventListener('mouseleave', () => {
      this._hideHoverInfo();
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._handleContextMenu(e);
    });

    // Manual horizontal dragging: start on pointerdown near a selected point
    canvas.addEventListener('pointerdown', (e) => {
      try {
        if (!this.chart || !this._initialized) return;
        if (this.card.pointerSelecting) return;
        if (this.card.isDragging) return;
        if (e.button !== undefined && e.button !== 0) return;

        const points = this.chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
        if (!points?.length) return;

        const datasetIndex = points[0].datasetIndex ?? 0;
        const index = points[0].index;

        // Must be near the point
        const meta = this.chart.getDatasetMeta(datasetIndex);
        const pointEl = meta?.data?.[index];
        if (!pointEl) return;

        const pos = typeof pointEl.tooltipPosition === 'function'
          ? pointEl.tooltipPosition()
          : { x: pointEl.x, y: pointEl.y };
        const canvasPos = this._getCanvasRelativePosition(e);
        const dx = canvasPos.x - pos.x;
        const dy = canvasPos.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const tolerancePx = 12;
        if (dist > tolerancePx) return;

        // Start only if the point is selected (or select it first)
        const selMgr = this.card.selectionManager;
        if (selMgr && typeof selMgr.isSelected === 'function') {
          if (!selMgr.isSelected(index)) {
            selMgr.selectPoint(index);
            this.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
            this.update('none');
          }
        }

        // Freshly compute bounds and snapshot starting X for current selection
        this.dragBounds = {};
        this.initialSelectedX = {};
        const allByTime = this.chart.data.datasets[datasetIndex].data
          .map((pt, idx) => ({ idx, x: Math.round(Number(pt?.x ?? 0)) }))
          .sort((a, b) => a.x - b.x);
        const selected = (selMgr && typeof selMgr.getSelectedPoints === 'function')
          ? selMgr.getSelectedPoints()
          : [index];
        const selectedSet = new Set(selected);
        const firstIdxByTime = allByTime[0]?.idx;
        const lastIdxByTime = allByTime[allByTime.length - 1]?.idx;

        selected.forEach((selIdx) => {
          const entryPos = allByTime.findIndex((e2) => e2.idx === selIdx);
          let leftBound = 0;
          let rightBound = 1440;
          let leftNeighborX = null;
          let rightNeighborX = null;

          // Scan left
          for (let k = entryPos - 1; k >= 0; k--) {
            const e2 = allByTime[k];
            if (!selectedSet.has(e2.idx)) {
              leftBound = e2.x + 1;
              leftNeighborX = e2.x;
              break;
            }
          }

          // Scan right
          for (let k = entryPos + 1; k < allByTime.length; k++) {
            const e2 = allByTime[k];
            if (!selectedSet.has(e2.idx)) {
              rightBound = e2.x - 1;
              rightNeighborX = e2.x;
              break;
            }
          }

          const origX = Math.round(Number(this.chart.data.datasets[datasetIndex].data[selIdx]?.x ?? 0));
          // Lock first/last points completely
          const isEdge = selIdx === firstIdxByTime || selIdx === lastIdxByTime;
          this.dragBounds[selIdx] = {
            left: isEdge ? origX : Math.max(0, leftBound),
            right: isEdge ? origX : Math.min(1440, rightBound),
            leftNeighborX,
            rightNeighborX,
            origX,
          };
          const p2 = this.chart.data.datasets[datasetIndex].data[selIdx];
          if (p2) this.initialSelectedX[selIdx] = p2.x;
        });
        this.dragSelectedPoints = [...selected].sort((a, b) => a - b);

        this.dragDatasetIndex = datasetIndex;
        this.dragActiveIndex = index;
        this.dragStartX = this.chart.data.datasets[datasetIndex].data[index]?.x ?? 0;

        // Start manual horizontal drag
        this._hDragActive = true;
        this._hDragPointerId = e.pointerId;
        this._hDragStartClient = { x: e.clientX, y: e.clientY };
        this._hDragStartedAt = Date.now();
        this.card.isDragging = true;
        window.addEventListener('pointermove', this._boundOnWindowPointerMove, { capture: true, passive: true });
        window.addEventListener('pointerup', this._boundOnWindowPointerUp, { capture: true, passive: true });
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch { }
      } catch { }
    }, { passive: true, capture: true });

    // Rely on Chart.js internal responsive resizing; no extra window resize listener
    // window.addEventListener('resize', this._boundHandleResize);

    try {
      const ctx = canvas.getContext('2d');
      const isSwitch = !!this.card.config?.is_switch_preset;
      const step = isSwitch ? 1 : (Number(this.card.config?.step_value) || 1);
      const minV = isSwitch ? 0 : (Number(this.card.config?.min_value) ?? 0);
      const maxV = isSwitch ? 1 : (Number(this.card.config?.max_value) ?? 100);

      // Stabilize initial layout for switch preset by enforcing a fixed container height at first paint
      try {
        const container = this.card.shadowRoot?.querySelector('.chart-container');
        if (container && isSwitch) {
          const fixedPx = Number(this.card.config?.initial_chart_height_px) || 320;
          container.style.height = `${fixedPx}px`;
          container.setAttribute('data-initial-fixed-height', String(fixedPx));
        }
      } catch { }

      // Custom plugin to draw current time indicator
      const currentTimeIndicatorPlugin = {
        id: 'currentTimeIndicator',
        afterDatasetsDraw: (chart) => {
          try {
            const { ctx, chartArea, scales } = chart;
            if (!ctx || !chartArea || !scales || !scales.x) return;

            const { top, bottom, left, right } = chartArea;
            const x = scales.x;
            const now = new Date();
            const minutes = now.getHours() * 60 + now.getMinutes();
            const xPos = x.getPixelForValue(minutes);

            if (typeof xPos === 'number' && !isNaN(xPos) && xPos >= left && xPos <= right) {
              ctx.save();
              // Dashed Vertical Line
              ctx.setLineDash([5, 5]);
              ctx.lineWidth = 1;
              ctx.strokeStyle = 'rgba(255, 82, 82, 0.4)';
              ctx.beginPath();
              ctx.moveTo(xPos, top);
              ctx.lineTo(xPos, bottom);
              ctx.stroke();

              // Inverted Triangle at top
              ctx.setLineDash([]);
              ctx.fillStyle = '#ff5252';
              ctx.beginPath();
              ctx.moveTo(xPos, top);
              ctx.lineTo(xPos - 6, top - 10);
              ctx.lineTo(xPos + 6, top - 10);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
          } catch (e) {
            // Silently ignore to prevent chart crash
          }
        }
      };

      const localizeUi = (suffix) => {
        const k = `ui.${suffix}`;
        const fromEditor = this.card?.editor?.i18n?._t?.(k);
        if (fromEditor && fromEditor !== k) return fromEditor;
        const fromLoc = this.card.localizationManager?.localize?.(this.card.language, k);
        if (fromLoc && fromLoc !== k) return fromLoc;
        if (this.card.language === 'it') return (suffix === 'switch_on') ? 'Acceso' : 'Spento';
        return (suffix === 'switch_on') ? 'On' : 'Off';
      };

      const rawData = this.card.stateManager?.scheduleData || [];
      const dataArr = rawData.map(p => ({
        x: this.card.stateManager.timeToMinutes(p.time),
        y: Number(p.value)
      }));

      const clamp = (val) => {
        if (isSwitch) {
          return (Number(val) >= 0.5) ? 1 : 0;
        }
        const rounded = Math.round(val / step) * step;
        return Math.max(minV, Math.min(maxV, rounded));
      };

      const chartConfig = {
        type: 'line',
        data: {
          datasets: [{
            label: this._getYTitle(),
            data: dataArr,
            borderColor: COLORS.primary,
            backgroundColor: 'rgba(3, 169, 244, 0.08)', // Lighter fill for better visibility
            pointRadius: 6,
            pointHoverRadius: 9,
            pointHitRadius: 15,
            pointBackgroundColor: COLORS.primary,
            pointBorderColor: COLORS.primary,
            borderWidth: 2,
            tension: 0,
            spanGaps: true,
            fill: true,
            clip: false
          }]
        },
        plugins: [currentTimeIndicatorPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          // Disable animations to avoid initial layout jitter
          animation: false,
          // Debounce internal resize to avoid thrashing at startup
          resizeDelay: 200,
          // Ensure space for the triangle indicator at the top and labels at the bottom
          layout: { 
            padding: { 
              top: 15, 
              right: 10, 
              bottom: 25, 
              left: 10 
            } 
          },
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
          },
          onClick: (evt) => {
            try {
              const chart = this.chart;
              if (!chart) return;
              if (this.card.pointerSelecting) return;
              if (Date.now() < (this.card.suppressClickUntil || 0)) return;

              const canvasPosition = this._getCanvasRelativePosition(evt);
              const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);

              if (points.length > 0) {
                const idx = points[0].index;
                const meta = chart.getDatasetMeta(0);
                const pointEl = meta?.data?.[idx];

                if (pointEl) {
                  const pos = typeof pointEl.tooltipPosition === 'function'
                    ? pointEl.tooltipPosition()
                    : { x: pointEl.x, y: pointEl.y };
                  const dx = canvasPosition.x - pos.x;
                  const dy = canvasPosition.y - pos.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const tolerancePx = 18;

                  if (dist <= tolerancePx) {
                    if (isSwitch) {
                      const dataset = chart.data.datasets[0];
                      const p = dataset?.data?.[idx];
                      if (p) {
                        const before = Number(p.y) >= 0.5 ? 1 : 0;
                        const after = before === 1 ? 0 : 1;
                        p.y = after;
                        chart.update('none');

                        const newData = dataset.data.map((pt) => ({
                          time: this.card.stateManager.minutesToTime(Math.max(0, Math.min(1440, Number(pt.x)))),
                          value: Number(pt.y) >= 0.5 ? 1 : 0,
                        }));
                        this.card.stateManager.setData(newData);
                        this.card.hasUnsavedChanges = true;
                        this.card.requestUpdate();
                        return;
                      }
                    }
                    this._handleChartClick(evt, points);
                    return;
                  }
                }
              }

              // Point insertion logic
              const xScale = chart.scales?.x;
              const yScale = chart.scales?.y;
              if (!xScale || !yScale) return;

              if (canvasPosition.x < xScale.left || canvasPosition.x > xScale.right ||
                canvasPosition.y < yScale.top || canvasPosition.y > yScale.bottom) {
                return;
              }

              const timeX = xScale.getValueForPixel(canvasPosition.x);
              const valueY = yScale.getValueForPixel(canvasPosition.y);

              if (!Number.isFinite(timeX) || timeX < 0 || timeX > 1440) return;

              // Check if click is near the line
              const ds = this.chart?.data?.datasets?.[0]?.data || [];
              const hasData = Array.isArray(ds) && ds.length > 0;
              let isNearLine = true;

              if (hasData) {
                const minutes = timeX;
                const interpVal = this._interpolateValueAtMinutes(minutes);
                if (Number.isFinite(interpVal)) {
                  const lineYPx = yScale.getPixelForValue(interpVal);
                  const tolerancePx = 12;
                  isNearLine = Math.abs(canvasPosition.y - lineYPx) <= tolerancePx;
                }
              }

              if (!isNearLine) return;

              const exactMinutes = Math.round(timeX);
              const timeStr = this.card.stateManager.minutesToTime(exactMinutes);
              const roundedValue = clamp(valueY);

              const insertedIndex = this.card.stateManager.insertPoint(timeStr, roundedValue);
              this.updateData(this.card.stateManager.getData());

              try {
                this.card.selectionManager?.selectPoint?.(insertedIndex);
                this.updatePointStyling(insertedIndex, [insertedIndex]);
                this.chart.update('none');
              } catch { }

              this.card.requestUpdate();
            } catch (err) {
              Logger.warn('CHART', 'Error in onClick handler', err);
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              displayColors: false,
              callbacks: {
                title: (context) => {
                  const minutes = context[0].parsed.x;
                  return this.card.stateManager?.minutesToTime(minutes) || "??:??";
                },
                label: (context) => {
                  const val = context.parsed.y;
                  const uom = (this.card.config?.unit_of_measurement || '').trim();

                  if (isSwitch) {
                    return (Number(val) >= 0.5) ? localizeUi('switch_on') : localizeUi('switch_off');
                  }

                  const stepCfg = Number(this.card.config?.step_value);
                  const decimals = Number.isFinite(stepCfg)
                    ? Math.max(0, Math.min(6, (String(stepCfg).split('.')[1] || '').length))
                    : 1;
                  const valText = Number.isFinite(val) ? Number(val).toFixed(decimals) : String(val);
                  return `${valText}${uom ? ' ' + uom : ''}`;
                }
              }
            },
            dragData: {
              round: step,
              showTooltip: true,
              dragX: false,
              dragY: !isSwitch,
              onDragStart: (e, datasetIndex, index, value) => {
                if (!this.chart || !this._initialized) return false;
                if (this.card.pointerSelecting) return false;
                if (e.shiftKey || this.card.keyboardHandler?.shiftDown) return false;

                try {
                  Logger.log('DRAG', `[DragStart] isSwitch=${isSwitch} ds=${datasetIndex} idx=${index} value=${value}`);
                } catch { }

                // Disable pan during drag to prevent the whole chart from moving
                try {
                  this._panPrev = this.chart?.options?.plugins?.zoom?.pan?.enabled;
                  if (this.chart?.options?.plugins?.zoom?.pan) {
                    this.chart.options.plugins.zoom.pan.enabled = false;
                  }
                } catch { }

                if (isSwitch) {
                  // Switch preset: toggle on drag start
                  try {
                    const dataset = this.chart.data.datasets[datasetIndex];
                    const p = dataset?.data?.[index];

                    if (p) {
                      const before = Number(p.y);
                      let next;

                      // Determine toggle based on drag direction
                      try {
                        const chartArea = this.chart.chartArea;
                        const canvasPos = this._getCanvasRelativePosition(e);
                        if (chartArea && Number.isFinite(canvasPos?.y)) {
                          const midY = (chartArea.top + chartArea.bottom) / 2;
                          next = (canvasPos.y < midY) ? 1 : 0;
                        }
                      } catch { }

                      // Fallback to simple toggle if position detection fails
                      if (next !== 0 && next !== 1) {
                        next = (before >= 0.5) ? 0 : 1;
                      }

                      p.y = next;
                      Logger.log('DRAG', `[SwitchToggle] idx=${index} ${before} -> ${p.y}`);
                      this.chart.update('none');

                      const newData = dataset.data.map((pt) => ({
                        time: this.card.stateManager.minutesToTime(Math.max(0, Math.min(1440, Number(pt.x)))),
                        value: Number(pt.y) >= 0.5 ? 1 : 0
                      }));
                      this.card.stateManager.setData(newData);
                      this.card.hasUnsavedChanges = true;
                      this.card.requestUpdate();
                    }
                  } catch (err) {
                    try {
                      Logger.warn('DRAG', '[SwitchToggle] error', err);
                    } catch { }
                  }
                  return false; // Prevent drag plugin from taking over
                }

                // Check if pointer is within tolerance of the point
                try {
                  const meta = this.chart.getDatasetMeta(datasetIndex);
                  const pointEl = meta?.data?.[index];
                  if (!pointEl) return false;

                  const pos = typeof pointEl.tooltipPosition === 'function'
                    ? pointEl.tooltipPosition()
                    : { x: pointEl.x, y: pointEl.y };
                  const canvasPos = this._getCanvasRelativePosition(e);
                  const dx = canvasPos.x - pos.x;
                  const dy = canvasPos.y - pos.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const tolerancePx = 12;
                  if (dist > tolerancePx) return false;
                } catch { }

                try {
                  this.dragStartValue = value;
                  this.dragStartIndex = index;
                  this.dragStartX = this.chart.data.datasets[datasetIndex].data[index]?.x ?? 0;
                  this.initialSelectedValues = {};
                  this.initialSelectedX = {};
                  this.dragBounds = {};
                  this.dragDatasetIndex = datasetIndex;
                  this.dragActiveIndex = index;

                  const selMgr = this.card.selectionManager;
                  const pointsToMove = (selMgr && typeof selMgr.isSelected === 'function' && selMgr.isSelected(index))
                    ? selMgr.getSelectedPoints()
                    : [index];
                  this.dragSelectedPoints = Array.isArray(pointsToMove)
                    ? [...pointsToMove].sort((a, b) => a - b)
                    : [index];

                  pointsToMove.forEach(i => {
                    const pointObj = this.chart.data.datasets[datasetIndex].data[i];
                    if (pointObj) {
                      this.initialSelectedValues[i] = pointObj.y;
                      this.initialSelectedX[i] = pointObj.x;
                    }
                  });

                  // Precompute neighbor bounds
                  const allByTime = this.chart.data.datasets[datasetIndex].data
                    .map((pt, idx) => ({ idx, x: Math.round(Number(pt?.x ?? 0)) }))
                    .sort((a, b) => a.x - b.x);
                  const selectedSet = new Set(this.dragSelectedPoints);

                  this.dragSelectedPoints.forEach((selIdx) => {
                    const entryPos = allByTime.findIndex((e) => e.idx === selIdx);
                    let leftBound = 0;
                    let rightBound = 1440;
                    let leftNeighborX = null;
                    let rightNeighborX = null;
                    let leftNeighborIdx = null;
                    let rightNeighborIdx = null;

                    // Scan left
                    for (let k = entryPos - 1; k >= 0; k--) {
                      const e2 = allByTime[k];
                      if (!selectedSet.has(e2.idx)) {
                        leftBound = e2.x + 1;
                        leftNeighborX = e2.x;
                        leftNeighborIdx = e2.idx;
                        break;
                      }
                    }

                    // Scan right
                    for (let k = entryPos + 1; k < allByTime.length; k++) {
                      const e2 = allByTime[k];
                      if (!selectedSet.has(e2.idx)) {
                        rightBound = e2.x - 1;
                        rightNeighborX = e2.x;
                        rightNeighborIdx = e2.idx;
                        break;
                      }
                    }

                    this.dragBounds[selIdx] = {
                      left: Math.max(0, leftBound),
                      right: Math.min(1440, rightBound),
                      leftNeighborX,
                      rightNeighborX,
                      leftNeighborIdx,
                      rightNeighborIdx,
                      origX: Math.round(Number(this.initialSelectedX[selIdx] ?? 0))
                    };

                    try {
                      const b = this.dragBounds[selIdx];
                      Logger.log('DRAG', `[Bounds] idx=${selIdx} orig=${b.origX} leftNeighbor=${b.leftNeighborX ?? 'none'} rightNeighbor=${b.rightNeighborX ?? 'none'} bounds=[${b.left},${b.right}]`);
                    } catch { }
                  });

                  this.card.isDragging = true;
                  this.card.requestUpdate();
                  return true;
                } catch (err) {
                  return false;
                }
              },
              onDrag: (e, datasetIndex, index, value) => {
                if (e.target) e.target.style.cursor = 'grabbing';
                if (this.card.pointerSelecting) return;

                try {
                  if (isSwitch) {
                    Logger.log('DRAG', `[Drag] isSwitch=true (should not happen) ds=${datasetIndex} idx=${index} value=${value}`);
                    return;
                  }

                  const diff = value - this.dragStartValue;
                  const dataset = this.chart.data.datasets[datasetIndex];
                  const dxMinutes = 0;

                  const selMgr = this.card.selectionManager;
                  const hasExplicitMulti = Array.isArray(this.dragSelectedPoints) && this.dragSelectedPoints.length > 1;
                  const pointsToMove = hasExplicitMulti ? this.dragSelectedPoints : [index];

                  if (pointsToMove.length >= 1) {
                    const isSelectedSet = new Set(pointsToMove);

                    // Determine first and last points by time
                    const allByTime = dataset.data
                      .map((pt, idx) => ({ idx, x: Math.round(Number(pt?.x ?? 0)) }))
                      .sort((a, b) => a.x - b.x);
                    const firstIdx = allByTime[0]?.idx;
                    const lastIdx = allByTime[allByTime.length - 1]?.idx;

                    pointsToMove.forEach(i => {
                      const origY = this.initialSelectedValues[i];
                      const origX = this.initialSelectedX[i];
                      const p = dataset.data[i];
                      if (!p) return;

                      // Vertical move
                      if (origY !== undefined) {
                        let newVal = origY + diff;
                        if (isSwitch) {
                          newVal = (Number(newVal) >= 0.5) ? 1 : 0;
                        } else {
                          newVal = Math.max(minV, Math.min(maxV, Math.round(newVal / step) * step));
                        }
                        p.y = newVal;
                      }

                      // Horizontal move (constrained) - but not for first/last points
                      if (origX !== undefined && Number.isFinite(dxMinutes) && i !== firstIdx && i !== lastIdx) {
                        let desiredX = Math.round(origX + dxMinutes);
                        if (!Number.isFinite(desiredX)) desiredX = Math.round(origX);

                        const bounds = this.dragBounds?.[i] || { left: 0, right: 1440 };
                        let newX = Math.max(bounds.left, Math.min(bounds.right, desiredX));
                        newX = Math.max(0, Math.min(1440, newX));
                        p.x = newX;

                        try {
                          Logger.log('DRAG', `[Move] idx=${i} orig=${Math.round(origX)} desired=${desiredX} bounds=[${bounds.left},${bounds.right}] neighbors L=${bounds.leftNeighborX ?? 'none'} R=${bounds.rightNeighborX ?? 'none'} -> new=${newX}`);
                        } catch { }
                      }
                    });
                    this.chart.update('none');
                  }
                } catch (err) { }

                try {
                  const p = this.chart?.data?.datasets?.[datasetIndex]?.data?.[index];
                  if (p && typeof p.y === 'number') return p.y;
                } catch { }
              },
              onDragEnd: (e, datasetIndex, index, value) => {
                if (e.target) e.target.style.cursor = 'default';
                if (this.card.pointerSelecting) return;
                this.card.isDragging = false;
                this.dragDatasetIndex = null;
                this.dragActiveIndex = null;

                // Re-enable pan after drag ends
                try {
                  if (this.chart?.options?.plugins?.zoom?.pan) {
                    const prev = (this._panPrev === undefined) ? true : !!this._panPrev;
                    this.chart.options.plugins.zoom.pan.enabled = prev;
                  }
                } catch { }

                try {
                  const dataset = this.chart.data.datasets[datasetIndex];
                  const newData = dataset.data.map((p) => {
                    const minutes = Math.max(0, Math.min(1440, Number(p.x)));
                    return { time: this.card.stateManager.minutesToTime(minutes), value: p.y };
                  });

                  this.card.stateManager.setData(newData);
                  this.card.hasUnsavedChanges = true;
                  this.card.requestUpdate();
                } catch (err) { }
              },
            },
            zoom: {
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'x',
              },
              pan: {
                enabled: true,
                mode: 'x',
                // Require Ctrl key for panning to avoid interference with point drag
                modifierKey: 'ctrl',
              },
              limits: {
                x: { min: 0, max: 1440 },
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
              min: -20,
              max: 1460,
              ticks: {
                stepSize: 120,
                maxRotation: 0,
                autoSkip: true,
                callback: (value) => {
                  const h = Math.floor(value / 60);
                  const m = Math.round(value % 60);
                  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                }
              },
              title: { display: true, text: this._getXTitle() }
            },
            y: isSwitch ? {
              min: -0.05,
              max: 1.05,
              ticks: {
                stepSize: 1,
                callback: (value) => {
                  if (value === 0) return localizeUi('switch_off');
                  if (value === 1) return localizeUi('switch_on');
                  return '';
                },
              },
              title: { display: true, text: this._getYTitle() }
            } : {
              min: minV,
              max: maxV,
              ticks: {
                callback: (value) => {
                  const stepCfg = Number(this.card.config?.step_value);
                  const decimals = Number.isFinite(stepCfg)
                    ? Math.max(0, Math.min(6, (String(stepCfg).split('.')[1] || '').length))
                    : 0;
                  return Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : String(value);
                },
              },
              title: { display: true, text: this._getYTitle() }
            }
          }
        }
      };

      this.chart = new Chart(ctx, chartConfig);
      this._initialized = true;
      Logger.log('CHART', '[ChartManager] Chart initialized successfully');
      return true;

    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error initializing chart:', e);
      return false;
    }
  }

  _handleChartClick(evt, points) {
    if (!this.card.selectionManager) {
      Logger.warn('CHART', '[ChartManager] SelectionManager is not initialized');
      return;
    }

    if (points.length) {
      const index = points[0].index;
      try {
        if (evt.ctrlKey || evt.metaKey) {
          this.card.selectionManager.togglePoint(index);
        } else if (evt.shiftKey) {
          this.card.selectionManager.selectRange(index);
        } else {
          this.card.selectionManager.selectPoint(index);
        }
      } catch (e) {
        Logger.error('CHART', 'Error handling click selection', e);
      }
    }
  }

  _handleContextMenu(e) {
    if (!this.chart) return;
    const points = this.chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
    if (points.length) {
      const index = points[0].index;
      this.card.stateManager.removePoint(index);
      this.updateData(this.card.stateManager.getData());
      this.card.requestUpdate();
    }
  }

  updateData(newData) {
    if (!this.chart || !this.card.stateManager) return;

    const dataArr = newData.map(p => ({
      x: this.card.stateManager.timeToMinutes(p.time),
      y: Number(p.value)
    }));

    if (this.chart.data?.datasets?.[0]) {
      this.chart.data.datasets[0].data = dataArr;
      this.chart.update('none');
    }
  }

  recreateChartOptions() {
    if (!this.chart) return;
    if (this.chart.options?.scales?.y) {
      const isSwitch = (this.card.selectedPreset === 'generic_switch');
      if (isSwitch) {
        this.chart.options.scales.y.min = -0.05;
        this.chart.options.scales.y.max = 1.05;
        this.chart.options.scales.y.suggestedMin = undefined;
        this.chart.options.scales.y.suggestedMax = undefined;
        this.chart.options.scales.y.grace = undefined;
        this.chart.options.scales.y.ticks = {
          stepSize: 1,
          callback: (value) => {
            if (value === 0) return 'Off';
            if (value === 1) return 'On';
            return '';
          },
        };
      } else {
        this.chart.options.scales.y.min = this.card.config.min_value ?? 0;
        this.chart.options.scales.y.max = this.card.config.max_value ?? 100;
      }
    }
    if (this.chart.options?.scales?.x) {
      this.chart.options.scales.x.min = -20;
      this.chart.options.scales.x.max = 1460;
    }
    if (this.chart.options?.scales?.x?.title) {
      this.chart.options.scales.x.title.text = this._getXTitle();
    }
    this.chart.update('none');
  }

  updateChartLabels() {
    this.recreateChartOptions();
  }

  updatePointStyling(selectedIndex, selectedPoints) {
    if (!this.chart) return;
    const dataset = this.chart.data.datasets[0];
    if (!dataset || !dataset.data) return;

    const colors = dataset.data.map((_, i) => {
      const isAnchor = (selectedIndex !== null && selectedIndex === i);
      if (isAnchor) return COLORS.anchor;
      if (Array.isArray(selectedPoints) && selectedPoints.includes(i)) return COLORS.selected;
      return COLORS.primary;
    });

    dataset.pointBackgroundColor = colors;
    dataset.pointBorderColor = colors;
  }

  destroy() {
    // window.removeEventListener('resize', this._boundHandleResize);
    if (this.chart) {
      try {
        this.chart.destroy();
      } catch (e) { }
      this.chart = null;
    }
    this._initialized = false;
  }
}