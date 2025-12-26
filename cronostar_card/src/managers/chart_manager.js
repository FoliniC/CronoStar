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
    this._dragDisplayTimer = null;
    this._hoverHideTimer = null;

    // Manual horizontal drag state
    this._hDragActive = false;
    this._hDragPointerId = null;
    this._hDragStartClient = null;
    this._hDragStartedAt = 0;
    this._boundOnWindowPointerMove = this._onWindowPointerMove.bind(this);
    this._boundOnWindowPointerUp = this._onWindowPointerUp.bind(this);
  }

  // Ensure switch preset loads a profile if schedule is empty
  _ensureSwitchProfileLoaded(retries = 5) {
    try {
      const isSwitch = !!(this.card.config?.is_switch_preset || this.card.selectedPreset?.includes('switch'));
      const hasNoData = !Array.isArray(this.card.stateManager?.scheduleData) || this.card.stateManager.scheduleData.length === 0;
      if (!isSwitch || !hasNoData) return;
      if (!this.card.hass || !this.card.profileManager?.loadProfile) {
        if (retries > 0) setTimeout(() => this._ensureSwitchProfileLoaded(retries - 1), 250);
        return;
      }
      const candidates = [
        this.card.selectedProfile,
        this.card.profileManager.lastLoadedProfile,
        'Default',
        'Comfort'
      ].filter(Boolean);
      if (!candidates.length) return;
      const tryNext = (idx = 0) => {
        const name = candidates[idx];
        if (!name) return;
        this.card.profileManager.loadProfile(name).catch(() => {
            if (idx + 1 < candidates.length) tryNext(idx + 1);
        });
      };
      tryNext(0);
    } catch { }
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

      let snapMinutes = Number(this.card.config?.keyboard_time_step_minutes) || 5;

      if (e.shiftKey) snapMinutes = 30;
      else if (e.ctrlKey || e.metaKey) snapMinutes = 1;
      else if (e.altKey) snapMinutes = 30;

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
    } catch (err) { }
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
          time: this.card.stateManager.minutesToTime(Math.max(0, Math.min(1440, Number(p.x)))),
          value: p.y
        }));
        this.card.stateManager.setData(newData);
        this.card.hasUnsavedChanges = true;
      }
      this.card.isDragging = false;
      this.scheduleHideDragValueDisplay(500);
    } catch { }
  }

  isInitialized() { return this._initialized && !!this.chart; }
  getChart() { return this.chart; }
  _getXTitle() { return this.card.localizationManager?.localize(this.card.language, 'ui.hours_label') || 'Hours'; }
  _getYTitle() { return this.card.config?.y_axis_label || this.card.localizationManager?.localize(this.card.language, 'ui.temperature_label') || 'Value'; }

  update(mode = 'none') {
    if (!this.chart) return;
    try { this.chart.update(mode); } catch { try { this.chart.update(); } catch { } }
  }

  showDragValueDisplay(value, minutes) {
    try {
      const el = this.card.shadowRoot?.getElementById('drag-value-display');
      if (!el || !this.chart || !this.chart.canvas?.isConnected) return;

      const valRaw = Number.isFinite(Number(value)) ? Number(value) : 0;
      const xRaw = Number.isFinite(Number(minutes)) ? Number(minutes) : 0;

      const xScale = this.chart.scales?.x;
      const yScale = this.chart.scales?.y;
      if (!xScale || !yScale) return;

      const pixelX = xScale.getPixelForValue(xRaw);
      const pixelY = yScale.getPixelForValue(valRaw);

      const container = this.card.shadowRoot?.querySelector('.chart-container');
      if (!container) return;

      const canvasRect = this.chart.canvas.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const isSwitch = !!(this.card.config?.is_switch_preset || this.card.selectedPreset?.includes('switch'));
      let text = isSwitch ? (valRaw >= 0.5 ? 'On' : 'Off') : valRaw.toFixed(1);
      text = `${this.card.stateManager.minutesToTime(xRaw)} • ${text}`;

      el.textContent = text;
      const leftPos = pixelX + (canvasRect.left - containerRect.left);
      const topPos = pixelY + (canvasRect.top - containerRect.top);
      const containerWidth = containerRect.width;
      const tooltipWidth = 100;

      if (leftPos + 8 + tooltipWidth > containerWidth) {
        el.style.left = `${Math.round(leftPos - tooltipWidth - 8)}px`;
        el.style.textAlign = 'right';
      } else {
        el.style.left = `${Math.round(leftPos + 8)}px`;
        el.style.textAlign = 'left';
      }

      el.style.top = `${Math.round(topPos - 28)}px`;
      el.style.display = 'block';
    } catch (e) { }
  }

  scheduleHideDragValueDisplay(ms = 2000) {
    if (this._dragDisplayTimer) clearTimeout(this._dragDisplayTimer);
    this._dragDisplayTimer = setTimeout(() => {
      const el = this.card.shadowRoot?.getElementById('drag-value-display');
      if (el) el.style.display = 'none';
    }, ms);
  }

  getIndicesInArea(minX, minY, maxX, maxY) {
    if (!this.chart) return [];
    const meta = this.chart.getDatasetMeta(0);
    const points = meta?.data || [];
    const container = this.card.shadowRoot?.querySelector('.chart-container');
    const canvasRect = this.chart.canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const ox = canvasRect.left - containerRect.left;
    const oy = canvasRect.top - containerRect.top;

    return points.map((pt, i) => {
      const pos = typeof pt.tooltipPosition === 'function' ? pt.tooltipPosition() : { x: pt.x, y: pt.y };
      const x = pos.x + ox; const y = pos.y + oy;
      return (x >= Math.min(minX, maxX) && x <= Math.max(minX, maxX) && y >= Math.min(minY, maxY) && y <= Math.max(minY, maxY)) ? i : -1;
    }).filter(i => i !== -1);
  }

  _getCanvasRelativePosition(evt) {
    const native = evt?.native || evt;
    const clientX = native.touches?.[0]?.clientX ?? native.changedTouches?.[0]?.clientX ?? native.clientX;
    const clientY = native.touches?.[0]?.clientY ?? native.changedTouches?.[0]?.clientY ?? native.clientY;
    const rect = this.chart.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _interpolateValueAtMinutes(minutes) {
    const ds = this.chart?.data?.datasets?.[0]?.data || [];
    if (!ds.length) return null;
    const data = [...ds].sort((a, b) => a.x - b.x);
    if (minutes <= data[0].x) return data[0].y;
    if (minutes >= data[data.length - 1].x) return data[data.length - 1].y;
    for (let i = 0; i < data.length - 1; i++) {
      if (minutes >= data[i].x && minutes <= data[i + 1].x) {
        const t = (minutes - data[i].x) / (data[i + 1].x - data[i].x || 1);
        return data[i].y + (data[i + 1].y - data[i].y) * t;
      }
    }
    return data[data.length - 1].y;
  }

  _showHoverInfo(evt) {
    try {
      if (this.card.isDragging || this.card.pointerSelecting) { this._hideHoverInfo(); return; }
      const el = this.card.shadowRoot?.getElementById('hover-value-display');
      if (!el || !this.chart || !this.chart.canvas?.isConnected) return;
      const pos = this._getCanvasRelativePosition(evt);
      const { x, y } = this.chart.scales;
      if (!x || !y) return;
      if (pos.x < x.left || pos.x > x.right || pos.y < y.top || pos.y > y.bottom) { this._hideHoverInfo(); return; }
      const minutes = x.getValueForPixel(pos.x);
      const val = this._interpolateValueAtMinutes(minutes);
      if (val === null) return;
      el.textContent = `${this.card.stateManager.minutesToTime(minutes)} • ${val.toFixed(1)}`;
      const cRect = this.chart.canvas.getBoundingClientRect();
      const cont = this.card.shadowRoot.querySelector('.chart-container');
      if (!cont) return;
      const contRect = cont.getBoundingClientRect();
      const leftPos = pos.x + (cRect.left - contRect.left);

      if (leftPos + 10 + 100 > contRect.width) {
        el.style.left = `${Math.round(leftPos - 110)}px`;
        el.style.textAlign = 'right';
      } else {
        el.style.left = `${Math.round(leftPos + 10)}px`;
        el.style.textAlign = 'left';
      }
      el.style.top = `${Math.round(pos.y + (cRect.top - contRect.top) - 24)}px`;
      el.style.display = 'block';
      if (this._hoverHideTimer) clearTimeout(this._hoverHideTimer);
      this._hoverHideTimer = setTimeout(() => this._hideHoverInfo(), 1500);
    } catch { }
  }

  _hideHoverInfo() {
    const el = this.card.shadowRoot?.getElementById('hover-value-display');
    if (el) el.style.display = 'none';
  }

  initChart(canvas) {
    if (!canvas) {
      Logger.error('CHART', '[CronoStar] initChart: canvas is null');
      return false;
    }
    if (!canvas.isConnected) {
      Logger.warn('CHART', '[CronoStar] initChart: canvas not connected, retrying...');
      requestAnimationFrame(() => this.initChart(canvas));
      return false;
    }

    Logger.log('CHART', '[CronoStar] initChart starting...', {
      config: this.card.config,
      schedulePoints: this.card.stateManager?.scheduleData?.length
    });

    this.destroy();

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (e.altKey) {
        const selMgr = this.card.selectionManager;
        const indices = selMgr.getActiveIndices();
        if (indices.length > 1) {
             this.card.stateManager.alignSelectedPoints('right');
             e.stopImmediatePropagation();
             return;
        }
      }
      const points = this.chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
      if (points.length) {
        this.card.stateManager.removePoint(points[0].index);
        this.updateData(this.card.stateManager.getData());
        this.card.requestUpdate();
      }
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.chart || this.card.pointerSelecting || e.button !== 0) return;
      if (e.altKey) {
        const selMgr = this.card.selectionManager;
        const indices = selMgr.getActiveIndices();
        if (indices.length > 1) {
          this.card.stateManager.alignSelectedPoints('left');
          e.stopImmediatePropagation();
          return;
        }
      }

      const points = this.chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
      if (!points.length) return;
      const idx = points[0].index;
      const selMgr = this.card.selectionManager;
      if (selMgr && !selMgr.isSelected(idx)) {
        selMgr.selectPoint(idx);
        this.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
        this.update('none');
      }
      this.dragBounds = {}; this.initialSelectedX = {};
      const dataset = this.chart.data.datasets[0];
      const allByTime = dataset.data.map((pt, i) => ({ i, x: Math.round(pt.x) })).sort((a, b) => a.x - b.x);
      const selected = selMgr.getSelectedPoints();
      const selectedSet = new Set(selected);
      selected.forEach(sIdx => {
        const pos = allByTime.findIndex(e => e.i === sIdx);
        let l = 0, r = 1440;
        for (let k = pos - 1; k >= 0; k--) { if (!selectedSet.has(allByTime[k].i)) { l = allByTime[k].x + 1; break; } }
        for (let k = pos + 1; k < allByTime.length; k++) { if (!selectedSet.has(allByTime[k].i)) { r = allByTime[k].x - 1; break; } }
        const isEdge = sIdx === allByTime[0].i || sIdx === allByTime[allByTime.length - 1].i;
        const curX = Math.round(dataset.data[sIdx].x);
        this.dragBounds[sIdx] = { left: isEdge ? curX : l, right: isEdge ? curX : r };
        this.initialSelectedX[sIdx] = dataset.data[sIdx].x;
      });
      this.dragDatasetIndex = 0; this.dragActiveIndex = idx; this.dragStartX = dataset.data[idx].x;
      this._hDragActive = true; this._hDragPointerId = e.pointerId;
      this.card.isDragging = true;
      window.addEventListener('pointermove', this._boundOnWindowPointerMove, { capture: true, passive: true });
      window.addEventListener('pointerup', this._boundOnWindowPointerUp, { capture: true, passive: true });
    }, { capture: true, passive: true });

    this._hoverHandler = (e) => this._showHoverInfo(e);
    this._hoverOutHandler = () => this._hideHoverInfo();
    canvas.addEventListener('pointermove', this._hoverHandler, { passive: true });
    canvas.addEventListener('pointerout', this._hoverOutHandler, { passive: true });

    const isSwitch = !!(this.card.config?.is_switch_preset || this.card.selectedPreset?.includes('switch'));
    const step = isSwitch ? 1 : (Number(this.card.config?.step_value) || 0.5);
    const minV = isSwitch ? 0 : Number(this.card.config?.min_value ?? 0);
    const maxV = isSwitch ? 1 : Number(this.card.config?.max_value ?? 100);

    const currentTimeIndicatorPlugin = {
      id: 'currentTimeIndicator',
      afterDatasetsDraw: (chart) => {
        const { ctx, chartArea, scales } = chart;
        if (!ctx || !chartArea || !scales?.x) return;
        const xPos = scales.x.getPixelForValue(new Date().getHours() * 60 + new Date().getMinutes());
        if (xPos < chartArea.left || xPos > chartArea.right) return;
        ctx.save(); ctx.setLineDash([5, 5]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255, 82, 82, 0.5)';
        ctx.beginPath(); ctx.moveTo(xPos, chartArea.top); ctx.lineTo(xPos, chartArea.bottom); ctx.stroke(); ctx.restore();
      }
    };

    this.chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          data: (Array.isArray(this.card.stateManager.scheduleData) && this.card.stateManager.scheduleData.length)
            ? this.card.stateManager.scheduleData.map(p => ({ x: this.card.stateManager.timeToMinutes(p.time), y: Number(p.value) }))
            : [{ x: 0, y: isSwitch ? 0 : minV }, { x: 1439, y: isSwitch ? 0 : minV }],
          borderColor: COLORS.primary, backgroundColor: 'rgba(3, 169, 244, 0.1)',
          pointRadius: 6, borderWidth: 2, tension: 0,
          stepped: isSwitch ? 'before' : false, fill: true, clip: false, spanGaps: true
        }]
      },
      plugins: [currentTimeIndicatorPlugin],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        layout: { padding: { top: 15, right: 10, bottom: 25, left: 10 } },
        onClick: (evt) => {
          if (!this.chart || this.card.pointerSelecting || Date.now() < (this.card.suppressClickUntil || 0) || evt.altKey) return;
          const pos = this._getCanvasRelativePosition(evt);
          const points = this.chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
          if (points.length) {
            const idx = points[0].index;
            if (isSwitch) {
              const p = this.chart.data.datasets[0].data[idx];
              p.y = (p.y >= 0.5) ? 0 : 1;
              this.chart.update('none');
              this.card.stateManager.setData(this.chart.data.datasets[0].data.map(pt => ({ time: this.card.stateManager.minutesToTime(pt.x), value: pt.y })));
              return;
            }
            this._handleChartClick(evt, points); return;
          }
          const { x, y } = this.chart.scales;
          if (!x || !y) return;
          if (pos.x < x.left || pos.x > x.right || pos.y < y.top || pos.y > y.bottom) return;
          const valY = Math.max(minV, Math.min(maxV, Math.round(y.getValueForPixel(pos.y) / step) * step));
          const idxNew = this.card.stateManager.insertPoint(this.card.stateManager.minutesToTime(x.getValueForPixel(pos.x)), isSwitch ? (valY >= 0.5 ? 1 : 0) : valY);
          this.updateData(this.card.stateManager.getData());
          this.card.selectionManager?.selectPoint(idxNew);
          this.updatePointStyling(idxNew, [idxNew]); this.update('none');
        },
        plugins: {
          legend: { display: false }, tooltip: { enabled: false },
          dragData: {
            round: step, showTooltip: false, dragX: false, dragY: !isSwitch,
            onDragStart: (e, ds, i, v) => {
              if (!this.chart || this.card.pointerSelecting || isSwitch) return false;
              const val = (typeof v === 'object' && v !== null && v.y !== undefined) ? v.y : v;
              this.dragStartValue = Number(val); this.initialSelectedValues = {};
              this.dragSelectedPoints = this.card.selectionManager.getSelectedPoints();
              this.dragSelectedPoints.forEach(idx => { this.initialSelectedValues[idx] = this.chart.data.datasets[0].data[idx].y; });
              this.card.isDragging = true; return true;
            },
            onDrag: (e, ds, i, v) => {
              const val = (typeof v === 'object' && v !== null && v.y !== undefined) ? v.y : v;
              let safeVal = Number(val); if (!Number.isFinite(safeVal)) return;
              const diff = safeVal - this.dragStartValue;
              this.dragSelectedPoints.forEach(idx => {
                if (this.initialSelectedValues[idx] === undefined) return;
                let newVal = Math.max(minV, Math.min(maxV, Math.round((this.initialSelectedValues[idx] + diff) / step) * step));
                this.chart.data.datasets[0].data[idx].y = newVal;
              });
              this.chart.update('none');
              const p = this.chart.data.datasets[0].data[i];
              if (p) this.showDragValueDisplay(p.y, p.x);
            },
            onDragEnd: () => {
              this.card.isDragging = false; this.scheduleHideDragValueDisplay(500);
              this.card.stateManager.setData(this.chart.data.datasets[0].data.map(p => ({ time: this.card.stateManager.minutesToTime(p.x), value: p.y })));
            }
          }
        },
        scales: {
          x: {
            type: 'linear', min: 0, max: 1440,
            ticks: {
              stepSize: 120, maxRotation: 90, minRotation: 0, autoSkip: true, includeBounds: true,
              callback: (v) => (v === 1439 || v === 1440) ? '23:59' : this.card.stateManager.minutesToTime(v)
            }
          },
          y: { min: isSwitch ? -0.1 : minV, max: isSwitch ? 1.1 : maxV, ticks: { stepSize: isSwitch ? 1 : undefined, callback: v => isSwitch ? (v === 0 ? 'Off' : (v === 1 ? 'On' : '')) : v } }
        }
      }
    });
    this._initialized = true;
    this._ensureSwitchProfileLoaded();
    return true;
  }

  _handleChartClick(evt, points) {
    const idx = points[0].index;
    if (evt.ctrlKey || evt.metaKey) this.card.selectionManager.togglePoint(idx);
    else if (evt.shiftKey) this.card.selectionManager.selectRange(idx);
    else this.card.selectionManager.selectPoint(idx);
  }

  updateData(newData) {
    if (!this.chart) return;
    this.chart.data.datasets[0].data = newData.map(p => ({ x: this.card.stateManager.timeToMinutes(p.time), y: Number(p.value) }));
    this.chart.update('none');
  }

  recreateChartOptions() {
    if (!this.chart) return;
    const isSwitch = !!(this.card.config?.is_switch_preset || this.card.selectedPreset?.includes('switch'));
    const y = this.chart.options.scales.y;
    y.min = isSwitch ? -0.05 : Number(this.card.config.min_value ?? 0);
    y.max = isSwitch ? 1.05 : Number(this.card.config.max_value ?? 100);
    this.chart.data.datasets[0].stepped = isSwitch ? 'before' : false;
    this.chart.update('none');
  }

  updatePointStyling(anchor, selected) {
    if (!this.chart) return;
    const ds = this.chart.data.datasets[0];
    ds.pointBackgroundColor = ds.data.map((_, i) => i === anchor ? COLORS.anchor : (selected.includes(i) ? COLORS.selected : COLORS.primary));
    ds.pointBorderColor = ds.pointBackgroundColor;
  }

  destroy() {
    if (this.chart) {
      const canvas = this.chart.canvas;
      if (canvas && this._hoverHandler && this._hoverOutHandler) {
        canvas.removeEventListener('pointermove', this._hoverHandler);
        canvas.removeEventListener('pointerout', this._hoverOutHandler);
      }
      this._hoverHandler = null; this._hoverOutHandler = null;
      try { this.chart.destroy(); } catch { }
      this.chart = null;
    }
    this._initialized = false;
  }
}