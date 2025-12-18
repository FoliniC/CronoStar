/** Chart Manager for CronoStar Card with Dynamic Points */
import Chart from 'chart.js/auto';
// Rimuovo l'uso di Chart.helpers.getRelativePosition e anche l'import da 'chart.js/helpers'
// Alcuni bundler/ambienti non espongono helpers come modulo separato
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
    this._boundHandleResize = this._handleResize.bind(this);
    this._dragDisplayTimer = null;
  }

  isInitialized() {
    return this._initialized && !!this.chart;
  }

  getChart() {
    return this.chart;
  }

  _getXTitle() {
    return this.card.localizationManager?.localize(this.card.language, 'ui.time_label') || 'Time';
  }

  _getYTitle() {
    return this.card.config?.y_axis_label ||
           this.card.localizationManager?.localize(this.card.language, 'ui.temperature_label') || 'Temp';
  }

  _handleResize() {
    if (this.chart) {
      this.chart.resize();
    }
  }

  // Safe wrapper used across handlers (keyboard/pointer)
  update(mode = 'none') {
    if (!this.chart) return;
    try {
      this.chart.update(mode);
    } catch (e) {
      try { this.chart.update(); } catch {}
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

      const uom = (this.card.config?.unit_of_measurement || '').trim();
      const text = Number.isFinite(valRaw) ? `${valRaw}${uom ? ' ' + uom : ''}` : '';

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
    } catch {}
  }

  // Fallback sicuro per ottenere la posizione relativa nel canvas (senza helpers)
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

  initChart(canvas) {
    if (!canvas) {
      Logger.error('CHART', '[ChartManager] initChart: canvas is null');
      return false;
    }

    this.destroy(); // Clean up existing

    // Listeners
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.lastMousePosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._handleContextMenu(e);
    });

    window.addEventListener('resize', this._boundHandleResize);

    try {
      const ctx = canvas.getContext('2d');
      const step = this.card.config?.step_value ?? 1;
      const minV = this.card.config?.min_value ?? 0;
      const maxV = this.card.config?.max_value ?? 100;

      const rawData = this.card.stateManager?.scheduleData || [];
      const dataArr = rawData.map(p => ({
        x: this.card.stateManager.timeToMinutes(p.time),
        y: Number(p.value)
      }));

      const clamp = (val) => {
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
            backgroundColor: COLORS.primaryLight,
            pointRadius: 6,
            pointHoverRadius: 9,
            pointHitRadius: 15,
            pointBackgroundColor: COLORS.primary,
            pointBorderColor: COLORS.primary,
            borderWidth: 2,
            tension: 0,
            spanGaps: true,
            fill: {
              target: 'origin',
              above: COLORS.primaryLight + '33'
            }
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false, // Important to prevent update crash
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: true
          },
          onClick: (evt) => {
            try {
              const chart = this.chart;
              if (!chart) return;

              const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);

              if (points.length > 0) {
                this._handleChartClick(evt, points);
                return;
              }

              // Inserimento punto con fallback custom (senza helpers)
              const canvasPosition = this._getCanvasRelativePosition(evt);

              // Verifica di essere nell'area tracciato
              const xScale = chart.scales?.x;
              const yScale = chart.scales?.y;
              if (!xScale || !yScale) return;
              if (canvasPosition.x < xScale.left || canvasPosition.x > xScale.right ||
                  canvasPosition.y < yScale.top || canvasPosition.y > yScale.bottom) {
                return;
              }

              const timeX = xScale.getValueForPixel(canvasPosition.x);
              const valueY = yScale.getValueForPixel(canvasPosition.y);

              if (Number.isFinite(timeX) && timeX >= 0 && timeX <= 1440) {
                const stepTime = this.card.config.step_time || 10;
                const roundedTimeMinutes = Math.round(timeX / stepTime) * stepTime;
                const timeStr = this.card.stateManager.minutesToTime(roundedTimeMinutes);
                const roundedValue = clamp(valueY);

                this.card.stateManager.insertPoint(timeStr, roundedValue);
                this.updateData(this.card.stateManager.getData());
                this.card.requestUpdate();
              }
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
                }
              }
            },
            dragData: {
              round: step,
              showTooltip: true,
              dragX: false,
              onDragStart: (e, datasetIndex, index, value) => {
                if (!this.chart || !this._initialized) return false;
                if (e.shiftKey || this.card.keyboardHandler?.shiftDown) return false;

                try {
                  this.dragStartValue = value;
                  this.dragStartIndex = index;
                  this.initialSelectedValues = {};

                  const selMgr = this.card.selectionManager;
                  const pointsToMove = (selMgr && typeof selMgr.isSelected === 'function' && selMgr.isSelected(index))
                    ? selMgr.getSelectedPoints()
                    : [index];

                  pointsToMove.forEach(i => {
                    const pointObj = this.chart.data.datasets[datasetIndex].data[i];
                    if (pointObj) {
                      this.initialSelectedValues[i] = pointObj.y;
                    }
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
                try {
                  const diff = value - this.dragStartValue;
                  const selMgr = this.card.selectionManager;
                  const pointsToMove = (selMgr && typeof selMgr.isSelected === 'function' && selMgr.isSelected(index))
                    ? selMgr.getSelectedPoints()
                    : [index];

                  if (pointsToMove.length > 1) {
                    pointsToMove.forEach(i => {
                      if (i === index) return;
                      const original = this.initialSelectedValues[i];
                      if (original !== undefined) {
                        let newVal = original + diff;
                        newVal = Math.max(minV, Math.min(maxV, Math.round(newVal / step) * step));
                        if (this.chart.data.datasets[datasetIndex].data[i]) {
                          this.chart.data.datasets[datasetIndex].data[i].y = newVal;
                        }
                      }
                    });
                    this.chart.update('none');
                  }
                } catch (err) {}
              },
              onDragEnd: (e, datasetIndex, index, value) => {
                if (e.target) e.target.style.cursor = 'default';
                this.card.isDragging = false;
                try {
                  const dataset = this.chart.data.datasets[datasetIndex];
                  const newData = [];
                  dataset.data.forEach((p) => {
                    newData.push({
                      time: this.card.stateManager.minutesToTime(p.x),
                      value: p.y
                    });
                  });
                  this.card.stateManager.setData(newData);
                  this.card.hasUnsavedChanges = true;
                  this.card.requestUpdate();
                } catch (err) {}
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
              min: 0,
              max: 1440,
              ticks: {
                stepSize: 60,
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
            y: {
              min: minV,
              max: maxV,
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
      this.chart.update('none'); // Safe update
    }
  }

  recreateChartOptions() {
    if (!this.chart) return;
    if (this.chart.options?.scales?.y) {
      this.chart.options.scales.y.min = this.card.config.min_value ?? 0;
      this.chart.options.scales.y.max = this.card.config.max_value ?? 100;
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
    // Do not call chart.update() here to avoid loops; caller updates.
  }

  destroy() {
    window.removeEventListener('resize', this._boundHandleResize);
    if (this.chart) {
      try {
        this.chart.destroy();
      } catch (e) {}
      this.chart = null;
    }
    this._initialized = false;
  }
}  