import Chart from 'chart.js/auto';
import dragDataPlugin from 'chartjs-plugin-dragdata';
import zoomPlugin from 'chartjs-plugin-zoom';

import { Logger, timeToMinutes, minutesToTime } from '../utils.js';
import { Events } from '../core/EventBus.js';
import { COLORS } from '../config.js';

// Explicitly register plugins (Reference: CronoStar.new)
Chart.register(dragDataPlugin, zoomPlugin);

export class ChartManager {
  constructor(context) {
    this.context = context;
    this.chart = null;
    this.canvas = null;
    this._initialized = false;

    // Interaction state
    this._isDragging = false;
    this._dragPointIndex = null;
    this._lastHoverIndex = null;
    this.lastMousePosition = null;
    this._dragDisplayTimer = null;
    this._hoverHideTimer = null;

    // Manual horizontal drag state (Reference: CronoStar.new)
    this._hDragActive = false;
    this._hDragPointerId = null;
    this._hDragStartClient = null;
    this._boundOnWindowPointerMove = this._onWindowPointerMove.bind(this);
    this._boundOnWindowPointerUp = this._onWindowPointerUp.bind(this);

    // Debounce timers
    this._updateTimer = null;

    this._setupEventListeners();
  }

  _onWindowPointerMove(e) {
    try {
      if (!this._hDragActive) return;
      if (this._hDragPointerId !== null && e.pointerId !== this._hDragPointerId) return;
      if (!this.chart) return;
      if (this.context._card.pointerSelecting) return;

      const dsIndex = this.dragDatasetIndex;
      const activeIndex = this.dragActiveIndex;
      if (dsIndex === null || dsIndex === undefined) return;

      const dataset = this.chart.data.datasets[dsIndex];
      const xScale = this.chart.scales?.x;
      if (!dataset || !xScale) return;

      const allByTime = dataset.data
        .map((pt, idx) => ({ idx, x: Math.round(Number(pt?.x ?? 0)) }))
        .sort((a, b) => a.x - b.x);

      const firstIdx = allByTime[0]?.idx;
      const lastIdx = allByTime[allByTime.length - 1]?.idx;

      const canvasRect = this.chart.canvas.getBoundingClientRect();
      const pxX = e.clientX - canvasRect.left;
      let minutes = xScale.getValueForPixel(pxX);
      if (!Number.isFinite(minutes)) return;

      // Handle modifiers for snap (configurable via card config)
      const cfg = this.context.config || {};
      const dragSnap = cfg.drag_snap || {};
      // Defaults: default=5, shift=30, ctrl/meta=1, alt=15
      let snapMinutes = Number(dragSnap.default ?? 5);
      if (e.shiftKey) snapMinutes = Number(dragSnap.shift ?? 30);
      else if (e.ctrlKey || e.metaKey) snapMinutes = Number(dragSnap.ctrl ?? 1);
      else if (e.altKey) snapMinutes = Number(dragSnap.alt ?? 15);
      snapMinutes = Math.max(1, Math.min(120, Math.round(snapMinutes)));

      minutes = Math.round(minutes / snapMinutes) * snapMinutes;

      const boundsActive = this.dragBounds?.[activeIndex] || { left: 0, right: 1440 };
      const clampedActive = Math.max(boundsActive.left, Math.min(boundsActive.right, minutes));
      const dxMinutes = clampedActive - Math.round(Number(this.initialSelectedX?.[activeIndex] ?? this.dragStartX ?? 0));

      const pointsToMove = Array.isArray(this.dragSelectedPoints) ? this.dragSelectedPoints : [activeIndex];

      pointsToMove.forEach((i) => {
        const p = dataset.data[i];
        if (!p || i === firstIdx || i === lastIdx) return;

        const origX = this.initialSelectedX?.[i];
        if (origX === undefined) return;
        const bounds = this.dragBounds?.[i] || { left: 0, right: 1440 };
        let newX = Math.max(bounds.left, Math.min(bounds.right, Math.round(origX + dxMinutes)));
        p.x = Math.max(0, Math.min(1440, newX));
      });

      this.chart.update('none');

      const activeX = dataset.data[activeIndex]?.x;
      const activeY = dataset.data[activeIndex]?.y;
      this.showDragValueDisplay(activeY, activeX);
    } catch (err) { /* ignore */ }
  }

  _onWindowPointerUp(e) {
    try {
      if (!this._hDragActive) return;
      this._hDragActive = false;
      window.removeEventListener('pointermove', this._boundOnWindowPointerMove, true);
      window.removeEventListener('pointerup', this._boundOnWindowPointerUp, true);

      const dsIndex = this.dragDatasetIndex ?? 0;
      const dataset = this.chart?.data?.datasets?.[dsIndex];
      if (dataset?.data?.length) {
        const sortedData = [...dataset.data].sort((a, b) => a.x - b.x);
        const newData = sortedData.map((p) => ({
          time: minutesToTime(Math.max(0, Math.min(1440, Number(p.x)))),
          value: p.y
        }));
        this.context.getManager('state').setData(newData);
      }
      this.context._card.isDragging = false;
      this._isDragging = false;
      this.scheduleHideDragValueDisplay(500);
    } catch (e) { /* ignore */ }
  }

  _setupEventListeners() {
    this.context.events.on(Events.SCHEDULE_UPDATED, (data) => {
      this._scheduleChartUpdate();
    });
    this.context.events.on(Events.SELECTION_CHANGED, (data) => {
      this._updatePointStyles();
    });
  }

  async initChart(canvas) {
    if (!canvas) return false;
    this.canvas = canvas;

    const stateManager = this.context.getManager('state');
    if (!stateManager) {
      Logger.error('CHART', 'StateManager not available');
      return false;
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.chart || this.context._card.pointerSelecting || e.button !== 0) return;

      const points = this.chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
      if (!points.length) return;

      const idx = points[0].index;
      const selectionManager = this.context.getManager('selection');

      if (selectionManager && !selectionManager.isSelected(idx)) {
        selectionManager.selectPoint(idx);
        this._updatePointStyles();
      }

      this.dragBounds = {};
      this.initialSelectedX = {};
      const dataset = this.chart.data.datasets[0];
      const allByTime = dataset.data.map((pt, i) => ({ i, x: Math.round(pt.x) })).sort((a, b) => a.x - b.x);
      const selected = selectionManager.getSelectedPoints();
      const selectedSet = new Set(selected);

      selected.forEach(sIdx => {
        const pos = allByTime.findIndex(ent => ent.i === sIdx);
        let l = 0, r = 1440;
        for (let k = pos - 1; k >= 0; k--) {
          if (!selectedSet.has(allByTime[k].i)) { l = allByTime[k].x + 1; break; }
        }
        for (let k = pos + 1; k < allByTime.length; k++) {
          if (!selectedSet.has(allByTime[k].i)) { r = allByTime[k].x - 1; break; }
        }
        const isEdge = sIdx === allByTime[0].i || sIdx === allByTime[allByTime.length - 1].i;
        const curX = Math.round(dataset.data[sIdx].x);
        this.dragBounds[sIdx] = { left: isEdge ? curX : l, right: isEdge ? curX : r };
        this.initialSelectedX[sIdx] = dataset.data[sIdx].x;
      });

      this.dragDatasetIndex = 0;
      this.dragActiveIndex = idx;
      this.dragStartX = dataset.data[idx].x;
      this._hDragActive = true;
      this._hDragPointerId = e.pointerId;
      this.context._card.isDragging = true;
      this._isDragging = true;

      window.addEventListener('pointermove', this._boundOnWindowPointerMove, { capture: true, passive: false });
      window.addEventListener('pointerup', this._boundOnWindowPointerUp, { capture: true, passive: false });
    }, { capture: true, passive: false });

    canvas.addEventListener('pointermove', (e) => {
      this.lastMousePosition = this._getCanvasRelativePosition(e);
      this._showHoverInfo(e);
    }, { passive: false });

    canvas.addEventListener('pointerout', () => this._hideHoverInfo(), { passive: false });

    const chartData = this._buildChartData(stateManager.getData());

    const currentTimeIndicatorPlugin = {
      id: 'currentTimeIndicator',
      afterDatasetsDraw: (chart) => {
        const { ctx, chartArea, scales } = chart;
        if (!ctx || !chartArea || !scales?.x) return;
        const xPos = scales.x.getPixelForValue(new Date().getHours() * 60 + new Date().getMinutes());
        if (xPos < chartArea.left || xPos > chartArea.right) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
        ctx.clip();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 82, 82, 0.6)';
        ctx.beginPath();
        ctx.moveTo(xPos, chartArea.top);
        ctx.lineTo(xPos, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    };

    const config = {
      type: 'line',
      data: chartData,
      options: this._buildChartOptions(),
      plugins: [currentTimeIndicatorPlugin]
    };

    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new Chart(canvas, config);
    this._initialized = true;

    this._setupResizeObserver(canvas.parentElement);
    this.context.events.emit(Events.CHART_READY);
    Logger.chart('Chart initialized');
    return true;
  }

  _buildChartData(schedule) {
    const config = this.context.config || {};
    const points = schedule.map(point => ({
      x: timeToMinutes(point.time),
      y: point.value
    }));

    return {
      datasets: [{
        label: config.y_axis_label || 'Value',
        data: points,
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primaryLight || 'rgba(3, 169, 244, 0.1)',
        borderWidth: 2,
        // Prevent points at chart borders (00:00, 23:59, min/max values) from being clipped.
        // This makes the full point visible even when it extends beyond the chart area.
        clip: false,
        fill: true,
        tension: 0,
        stepped: config.is_switch_preset ? 'after' : false,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: COLORS.primary,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        spanGaps: true
      }]
    };
  }

  _buildChartOptions() {
    const config = this.context.config || {};
    const isSwitch = !!config.is_switch_preset;
    const minValue = isSwitch ? 0 : (config.min_value ?? 0);
    const maxValue = isSwitch ? 1 : (config.max_value ?? 30);
    const step = config.step_value || 0.5;

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 15, right: 25, bottom: 25, left: 25 } },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: true
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 1440,
          ticks: {
            stepSize: 120,
            maxRotation: 90,
            minRotation: 0,
            autoSkip: true,
            includeBounds: true,
            callback: (v) => (v === 1439 || v === 1440) ? '23:59' : minutesToTime(v)
          },
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          title: { display: true, text: 'Time' }
        },
        y: {
          min: isSwitch ? -0.1 : minValue,
          max: isSwitch ? 1.1 : maxValue,
          ticks: {
            stepSize: isSwitch ? 1 : undefined,
            precision: 1,
            callback: (value) => {
              if (isSwitch) {
                if (value === 0) return 'off (0)';
                if (value === 1) return 'on (1)';
                return '';
              }
              const numericValue = Number(value);
              if (Number.isFinite(numericValue)) {
                return `${numericValue.toFixed(1)}${config.unit_of_measurement || ''}`;
              }
              return '';
            }
          },
          grid: { color: 'rgba(0, 0, 0, 0.1)' },
          title: { display: true, text: config.y_axis_label || 'Value' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        zoom: {
          pan: {
            enabled: true,
            onPanStart: (ctx) => {
              if (this._isDragging || this.context._card.isDragging) return false;
              const pos = this.lastMousePosition || { x: 0, y: 0 };
              const { x, y } = this.chart.scales;
              return (pos.y >= x.top || pos.x <= y.right);
            },
            mode: (ctx) => {
              const pos = this.lastMousePosition || { x: 0, y: 0 };
              const { x } = this.chart.scales;
              return (pos.y >= x.top) ? 'x' : 'y';
            },
            onPan: ({ chart }) => {
              // Dynamically adjust tick density while panning to keep labels informative
              this._updateXAxisTicksDensity(chart);
            },
            onPanComplete: ({ chart }) => {
              this._updateXAxisTicksDensity(chart);
            }
          },
          zoom: {
            wheel: { enabled: true, speed: 0.05 },
            pinch: { enabled: true },
            onZoomStart: (ctx) => {
              if (this._isDragging) return false;
              this.chart.canvas.style.opacity = '0';
              return true;
            },
            mode: (ctx) => {
              const pos = this.lastMousePosition || { x: 0, y: 0 };
              const { x, y } = this.chart.scales;
              if (pos.y >= x.top) return 'x';
              if (pos.x <= y.right) return 'y';
              return 'xy';
            },
            onZoom: ({ chart }) => {
              const { x, y } = chart.scales;
              const pos = this.lastMousePosition || { x: 0, y: 0 };
              const isOverX = pos.y >= x.top;
              const isOverY = pos.x <= y.right;
              const isInside = !isOverX && !isOverY;
              let needsUpdate = false;
              if ((isOverX || isInside) && !this.context._card.isExpandedH) {
                this.context._card.isExpandedH = true;
                needsUpdate = true;
              }
              if ((isOverY || isInside) && !this.context._card.isExpandedV) {
                this.context._card.isExpandedV = true;
                needsUpdate = true;
              }
              // Adjust tick density when zooming horizontally
              this._updateXAxisTicksDensity(chart);
              if (needsUpdate) {
                this.context.requestUpdate();
                setTimeout(() => { if (this.chart) this.chart.resize(); }, 410);
              }
            },
            onZoomComplete: ({ chart }) => {
              chart.canvas.style.opacity = '1';
              this._updateXAxisTicksDensity(chart);
              chart.update('none');
            }
          },
          limits: {
            x: { min: 0, max: 1440 },
            y: { min: isSwitch ? -0.1 : minValue, max: isSwitch ? 1.1 : maxValue }
          }
        },
        dragData: {
          round: step,
          magnet: {
            to: (value) => {
              if (isSwitch) {
                const val = (typeof value === 'object' && value !== null) ? value.y : value;
                const snapped = val >= 0.5 ? 1 : 0;
                if (typeof value === 'object' && value !== null) {
                  return { ...value, y: snapped };
                }
                return snapped;
              }
              return value;
            }
          },
          showTooltip: false,
          dragX: false,
          dragY: true,
          onDragStart: (e, datasetIndex, index, value) => {
            if (this.context._card.pointerSelecting) return false;
            this._isDragging = true;
            this.context.hasUnsavedChanges = true;
            this.context._card.isDragging = true;
            this._dragPointIndex = index;
            this.initialSelectedValues = {};
            const activeIndices = this.context.getManager('selection').getSelectedPoints();
            activeIndices.forEach(idx => {
              this.initialSelectedValues[idx] = this.chart.data.datasets[0].data[idx].y;
            });
            const startVal = (typeof value === 'object' && value !== null) ? value.y : value;
            this.dragStartValue = Number(startVal);
            return true;
          },
          onDrag: (e, datasetIndex, index, value) => {
            const val = (typeof value === 'object' && value !== null) ? value.y : value;
            const diff = Number(val) - this.dragStartValue;
            const data = this.chart.data.datasets[datasetIndex].data;
            Object.keys(this.initialSelectedValues).forEach(idx => {
              const i = Number(idx);
              let newVal = this.initialSelectedValues[i] + diff;
              if (isSwitch) {
                newVal = newVal >= 0.5 ? 1 : 0;
              } else {
                newVal = Math.max(minValue, Math.min(maxValue, Math.round(newVal / step) * step));
              }
              data[i].y = newVal;
            });
            this.chart.update('none');
            this.showDragValueDisplay(data[index].y, data[index].x);
          },
          onDragEnd: (e, datasetIndex, index, value) => {
            this._isDragging = false;
            this.context._card.isDragging = false;
            this.scheduleHideDragValueDisplay(500);
            const stateManager = this.context.getManager('state');
            if (stateManager) {
              const data = this.chart.data.datasets[datasetIndex].data;
              const schedule = data.map(p => ({
                time: minutesToTime(p.x),
                value: p.y
              }));
              stateManager.setData(schedule);
            }
          }
        }
      },
      onClick: (event, elements) => this._handleClick(event, elements)
    };
  }

  _showHoverInfo(evt) {
    try {
      if (this._isDragging || this.context._card.pointerSelecting) { this._hideHoverInfo(); return; }
      const hoverEl = this.context._card.shadowRoot?.getElementById('hover-value-display');
      if (!hoverEl || !this.chart || !this.chart.canvas?.isConnected) return;

      const pos = this._getCanvasRelativePosition(evt);
      const { x, y } = this.chart.scales;
      if (!x || !y) return;

      if (pos.x < x.left || pos.x > x.right || pos.y < y.top || pos.y > y.bottom) {
        this._hideHoverInfo();
        return;
      }

      const minutes = x.getValueForPixel(pos.x);
      const val = this._interpolateValueAtMinutes(minutes);
      if (val === null) return;

      const config = this.context.config || {};
      const isSwitch = !!config.is_switch_preset;
      const textVal = isSwitch ? (val >= 0.5 ? 'On' : 'Off') : val.toFixed(1);
      const unit = config.unit_of_measurement || '';

      hoverEl.textContent = `${minutesToTime(minutes)} • ${textVal}${!isSwitch ? unit : ''}`;

      hoverEl.style.left = `${Math.round(pos.x + 10)}px`;
      hoverEl.style.top = `${Math.round(pos.y - 24)}px`;
      hoverEl.style.display = 'block';

      if (this._hoverHideTimer) clearTimeout(this._hoverHideTimer);
      this._hoverHideTimer = setTimeout(() => this._hideHoverInfo(), 1500);
    } catch (e) { /* ignore */ }
  }

  _hideHoverInfo() {
    const hoverEl = this.context._card.shadowRoot?.getElementById('hover-value-display');
    if (hoverEl) {
      hoverEl.style.display = 'none';
    }
  }

  showDragValueDisplay(value, minutes) {
    try {
      const card = this.context._card;
      const el = card.shadowRoot?.getElementById('drag-value-display');
      if (!el || !this.chart || !this.chart.canvas?.isConnected) return;

      const xScale = this.chart.scales?.x;
      const yScale = this.chart.scales?.y;
      if (!xScale || !yScale) return;

      const pixelX = xScale.getPixelForValue(minutes);
      const pixelY = yScale.getPixelForValue(value);

      const container = card.shadowRoot?.querySelector('.chart-container');
      if (!container) return;

      const containerRect = container.getBoundingClientRect();

      const config = this.context.config || {};
      const isSwitch = !!config.is_switch_preset;
      let text = isSwitch ? (value >= 0.5 ? 'On' : 'Off') : value.toFixed(1);
      const unit = config.unit_of_measurement || '';
      const label = `${minutesToTime(minutes)} • ${text}${!isSwitch ? unit : ''}`;

      el.textContent = label;

      const leftPos = pixelX;
      const topPos = pixelY;
      const containerWidth = containerRect.width;
      const tooltipWidth = 100;

      if (leftPos + 8 + tooltipWidth > containerWidth) {
        el.style.left = `${Math.round(leftPos - tooltipWidth - 8)}px`;
      } else {
        el.style.left = `${Math.round(leftPos + 8)}px`;
      }

      el.style.top = `${Math.round(topPos - 28)}px`;
      el.style.display = 'block';

      if (this._dragDisplayTimer) clearTimeout(this._dragDisplayTimer);
    } catch (e) {
      Logger.error('CHART', 'Error showing drag tooltip:', e);
    }
  }

  scheduleHideDragValueDisplay(ms = 2000) {
    if (this._dragDisplayTimer) clearTimeout(this._dragDisplayTimer);
    this._dragDisplayTimer = setTimeout(() => {
      const el = this.context._card.shadowRoot?.getElementById('drag-value-display');
      if (el) el.style.display = 'none';
    }, ms);
  }

  _handleClick(event, elements) {
    if (Date.now() < (this.context._card.suppressClickUntil || 0)) return;

    const selectionManager = this.context.getManager('selection');
    const stateManager = this.context.getManager('state');
    if (!selectionManager || !stateManager) return;

    if (event.native.altKey) {
      event.native.preventDefault();
      event.native.stopPropagation();
      stateManager.alignSelectedPoints('left');
      this._updatePointStyles();
      return;
    }

    const hitElements = this.chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);

    if (hitElements.length > 0) {
      const index = hitElements[0].index;
      if (event.native.shiftKey) selectionManager.selectRange(index);
      else if (event.native.ctrlKey || event.native.metaKey) selectionManager.togglePoint(index);
      else selectionManager.selectPoint(index);
      this._updatePointStyles();
    } else {
      if (!event.native.shiftKey && !event.native.ctrlKey && !event.native.metaKey) {
        if (!this.chart) return;
        const pos = this._getCanvasRelativePosition(event.native);
        const xScale = this.chart.scales.x;
        const yScale = this.chart.scales.y;

        if (pos.x >= xScale.left && pos.x <= xScale.right && pos.y >= yScale.top && pos.y <= yScale.bottom) {
          const minutes = xScale.getValueForPixel(pos.x);
          const interpolatedY = this._interpolateValueAtMinutes(minutes);
          const config = this.context.config || {};
          const isSwitch = !!config.is_switch_preset;

          if (interpolatedY !== null) {
            const pixelY = yScale.getPixelForValue(interpolatedY);

            // For switches, click anywhere in the column. For others, must be near the line.
            if (isSwitch || Math.abs(pos.y - pixelY) < 25) {
              const time = minutesToTime(minutes);
              let value = yScale.getValueForPixel(pos.y);

              if (isSwitch) {
                value = value >= 0.5 ? 1 : 0;
              } else {
                const step = config.step_value || 0.5;
                value = Math.round(value / step) * step;
                const minV = config.min_value ?? 0;
                const maxV = config.max_value ?? 30;
                value = Math.max(minV, Math.min(maxV, value));
              }

              const newIndex = stateManager.insertPoint(time, value);
              selectionManager.selectPoint(newIndex);
            } else {
              selectionManager.clearSelection();
            }
          }
        } else {
          selectionManager.clearSelection();
        }
        this._updatePointStyles();
      }
    }
  }

  _scheduleChartUpdate() {
    if (this._updateTimer) clearTimeout(this._updateTimer);
    this._updateTimer = setTimeout(() => { this._updateChartData(); }, 16);
  }

  _updateChartData() {
    if (!this.chart) return;
    const stateManager = this.context.getManager('state');
    if (!stateManager) return;
    const schedule = stateManager.getData();
    const points = schedule.map(point => ({
      x: timeToMinutes(point.time),
      y: point.value
    }));
    this.chart.data.datasets[0].data = points;
    this.chart.update('none');
  }

  _updatePointStyles() {
    if (!this.chart) return;
    const selectionManager = this.context.getManager('selection');
    if (!selectionManager) return;
    const dataset = this.chart.data.datasets[0];
    const selected = selectionManager.getSelectedPoints();
    const anchor = selectionManager.getAnchor();

    dataset.pointBackgroundColor = dataset.data.map((_, i) =>
      i === anchor ? COLORS.anchor : (selected.includes(i) ? COLORS.selected : COLORS.primary)
    );
    dataset.pointBorderColor = dataset.pointBackgroundColor;
    dataset.pointRadius = dataset.data.map((_, i) => (i === anchor || selected.includes(i)) ? 8 : 6);

    this.chart.update('none');
  }

  _setupResizeObserver(container) {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      if (this.chart) {
        requestAnimationFrame(() => {
          if (this.chart) this.chart.resize();
        });
      }
    });
    this._resizeObserver.observe(container);
  }

  destroy() {
    if (this._updateTimer) clearTimeout(this._updateTimer);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.chart) {
      const canvas = this.chart.canvas;
      if (canvas && this._hoverHandler && this._hoverOutHandler) {
        canvas.removeEventListener('pointermove', this._hoverHandler);
        canvas.removeEventListener('pointerout', this._hoverOutHandler);
      }
      this._hoverHandler = null; this._hoverOutHandler = null;
      this.chart.destroy();
      this.chart = null;
    }
    this.canvas = null;
    this.context.events.emit(Events.CHART_DESTROYED);
    Logger.chart('Chart destroyed');
  }

  isInitialized() { return this._initialized && !!this.chart; }
  getChart() { return this.chart; }
  updateData(schedule) { this._updateChartData(); }
  recreateChartOptions() { if (this.chart) { this.chart.options = this._buildChartOptions(); this.chart.update('none'); } }
  updateChartLabels() { this.recreateChartOptions(); }
  update(mode) { if (this.chart) this.chart.update(mode); }
  updatePointStyling(index, indices) { this._updatePointStyles(); }
  getIndicesInArea(minX, minY, maxX, maxY) {
    if (!this.chart) return [];
    const meta = this.chart.getDatasetMeta(0);
    return (meta.data || []).map((pt, i) => (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) ? i : -1).filter(i => i !== -1);
  }
  deletePointAtEvent(e) {
    if (!this.chart) return false;
    const elements = this.chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
    if (elements.length > 0) {
      this.context.getManager('state')?.removePoint(elements[0].index);
      return true;
    }
    return false;
  }

  _getCanvasRelativePosition(evt) {
    const native = evt?.native || evt;
    const clientX = native.touches?.[0]?.clientX ?? native.changedTouches?.[0]?.clientX ?? native.clientX;
    const clientY = native.touches?.[0]?.clientY ?? native.changedTouches?.[0]?.clientY ?? native.clientY;

    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _interpolateValueAtMinutes(minutes) {
    if (!this.chart) return null;
    const ds = this.chart.data.datasets[0].data || [];
    if (!ds.length) return null;
    const data = [...ds].sort((a, b) => a.x - b.x);
    if (minutes <= data[0].x) return data[0].y;
    if (minutes >= data[data.length - 1].x) return data[data.length - 1].y;

    const config = this.context.config || {};
    const isSwitch = !!config.is_switch_preset;

    for (let i = 0; i < data.length - 1; i++) {
      if (minutes >= data[i].x && minutes <= data[i + 1].x) {
        if (isSwitch) {
          // Stepped 'after' interpolation: value is constant from start point
          return data[i].y;
        }
        const t = (minutes - data[i].x) / (data[i + 1].x - data[i].x || 1);
        return data[i].y + (data[i + 1].y - data[i].y) * t;
      }
    }
    return data[data.length - 1].y;
  }

  // Dynamically tune x-axis tick step based on current visible range
  _updateXAxisTicksDensity(chart) {
    try {
      const c = chart || this.chart;
      if (!c) return;
      const x = c.scales?.x;
      if (!x) return;

      const min = x.min ?? 0;
      const max = x.max ?? 1440;
      const visible = Math.max(1, Math.abs(max - min));

      // Determine a reasonable step in minutes based on zoom level
      // Aim for roughly 6–10 labels across the visible range
      const targetLabels = 8;
      let step = Math.ceil(visible / targetLabels);

      // Snap step to friendly minute increments
      const candidates = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240];
      step = candidates.find(s => s >= step) || 240;

      const tickCfg = c.options.scales.x.ticks;
      if (tickCfg.stepSize !== step) {
        tickCfg.stepSize = step;
        // Ensure bounds labels show correctly when very zoomed
        tickCfg.includeBounds = true;
        // Update without animating
        c.update('none');
      }
    } catch (e) { /* ignore */ }
  }
}
