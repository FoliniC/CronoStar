/** Chart Manager for CronoStar Card */
import Chart from 'chart.js/auto';
import dragDataPlugin from 'chartjs-plugin-dragdata';
import { COLORS, TIMEOUTS } from '../config.js';
import { Logger } from '../utils.js';

Chart.register(dragDataPlugin);

export class ChartManager {
  constructor(card) {
    this.card = card;
    this.chart = null;
    this._initialized = false;
    this._hideTimer = null;
  }

  isInitialized() {
    return this._initialized && !!this.chart;
  }

  getChart() {
    return this.chart;
  }

  _getXTitle() {
    try {
      return this.card.localizationManager.localize(this.card.language, 'ui.time_label');
    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error in _getXTitle:', e);
      return 'Time of Day';
    }
  }

  _getYTitle() {
    try {
      return this.card.config?.y_axis_label || this.card.localizationManager.localize(this.card.language, 'ui.temperature_label');
    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error in _getYTitle:', e);
      return 'Value';
    }
  }

  _getHourLabels() {
    try {
      const labels = [];
      for (let i = 0; i < 24; i++) {
        labels.push(this.card.stateManager.getHourLabel(i));
      }
      return labels;
    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error in _getHourLabels:', e);
      return [...Array(24)].map((_, i) => `${i.toString().padStart(2, '0')}:00`);
    }
  }

  initChart(canvas) {
    if (!canvas) {
      Logger.error('CHART', '[ChartManager] initChart: canvas is null/undefined');
      return false;
    }
    try {
      const ctx = canvas.getContext('2d');
      const step = this.card.config?.step_value ?? 1;
      const minV = this.card.config?.min_value ?? 0;
      const maxV = this.card.config?.max_value ?? 100;
      const dataArr = Array.isArray(this.card.stateManager?.scheduleData)
        ? this.card.stateManager.scheduleData.map(v => (v == null ? null : Number(v)))
        : new Array(24).fill(null);
      const labels = this._getHourLabels();
      const clamp = (val) => {
        const rounded = Math.round(val / step) * step;
        return Math.max(minV, Math.min(maxV, rounded));
      };

      const chartConfig = {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: this._getYTitle(),
              data: dataArr,
              borderColor: COLORS.primary,
              backgroundColor: COLORS.primaryLight,
              pointRadius: 5,
              pointHoverRadius: 8,
              pointHitRadius: 12,
              pointBackgroundColor: COLORS.primary,
              pointBorderColor: COLORS.primary,
              borderWidth: 2,
              tension: 0.4,
              spanGaps: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          interaction: {
            mode: 'nearest',
            intersect: true
          },
          plugins: {
            legend: { display: true },
            tooltip: { enabled: true },
            dragData: {
              round: step,
              showTooltip: true,
              dragX: false,
              onDragStart: (e, datasetIndex, index, value) => {
                Logger.log('DRAG', `[ChartManager] Drag start idx=${index}, value=${value}`);
                const disp = this.card.shadowRoot?.getElementById('drag-value-display');
                if (disp) {
                  disp.style.display = 'block';
                }
                this.card.isDragging = true;
                this.card.lastEditAt = Date.now();
                this.card.awaitingAutomation = false;
                this.card.outOfSyncDetails = "";
                this.card.cardSync.scheduleAutomationOverlaySuppression(TIMEOUTS.automationSuppression); // Corrected from this.card.scheduleAutomationOverlaySuppression
                this._clearHideTimer();
                this.card.requestUpdate();
              },
              onDrag: (e, datasetIndex, index, value) => {
                const clamped = clamp(value);
                const ds = this.chart.data.datasets[datasetIndex];
                ds.data[index] = clamped;
                if (Array.isArray(this.card.stateManager?.scheduleData)) {
                  this.card.stateManager.scheduleData[index] = clamped;
                }
                this.card.hasUnsavedChanges = true;
                const disp = this.card.shadowRoot?.getElementById('drag-value-display');
                if (disp) {
                  disp.textContent = String(clamped);
                  const rect = this.card.shadowRoot?.querySelector('.chart-container')?.getBoundingClientRect();
                  const x = e.x ?? e.native?.x ?? 0;
                  const y = e.y ?? e.native?.y ?? 0;
                  if (rect) {
                    disp.style.left = `${Math.max(0, x - rect.left + 8)}px`;
                    disp.style.top = `${Math.max(0, y - rect.top - 24)}px`;
                  }
                }
                this.chart.update('none');
              },
              onDragEnd: (e, datasetIndex, index, value) => {
                Logger.log('DRAG', `[ChartManager] Drag end idx=${index}, value=${value}`);
                this.card.isDragging = false;
                this.card.lastEditAt = Date.now();
                this.scheduleHideDragValueDisplay(2500);
                this.card.cardSync.scheduleAutomationOverlaySuppression(TIMEOUTS.automationSuppression); // Corrected from this.card.scheduleAutomationOverlaySuppression
                try {
                  this.card.cardSync.updateAutomationSync(this.card._hass);
                } catch (e) { Logger.warn('DRAG', 'Error updating automation sync on drag end:', e); }
              }
            }
          },
          scales: {
            x: {
              display: true,
              title: { display: true, text: this._getXTitle() },
              grid: { display: false }
            },
            y: {
              display: true,
              min: minV,
              max: maxV,
              title: { display: true, text: this._getYTitle() },
              ticks: { stepSize: step },
              grid: { color: 'rgba(0,0,0,0.05)' }
            }
          }
        }
      };

      this.chart = new Chart(ctx, chartConfig);
      this._initialized = true;
      Logger.log('CHART', '[ChartManager] Chart initialized successfully with dragData plugin');
      this.updatePointStyling(this.card.selectionManager?.selectedPoint ?? null, this.card.selectionManager?.selectedPoints ?? []);
      return true;
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Failed to initialize chart: ${err?.message}`);
      this._initialized = false;
      this.chart = null;
      return false;
    }
  }

  updateData(dataArr) {
    if (!this.isInitialized()) {
      Logger.warn('CHART', '[ChartManager] updateData called but chart is not initialized');
      return;
    }
    try {
      const normalized = Array.isArray(dataArr) ? dataArr.map(v => (v == null ? null : Number(v))) : [];
      this.chart.data.datasets[0].data = normalized;
      this.updatePointStyling(this.card.selectionManager?.selectedPoint ?? null, this.card.selectionManager?.selectedPoints ?? []);
      this.chart.update();
      Logger.log('CHART', '[ChartManager] Data updated');
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error updating data: ${err?.message}`);
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + `: ${err.message}`,
        'error'
      );
    }
  }

  recreateChartOptions() {
    if (!this.isInitialized()) {
      Logger.warn('CHART', '[ChartManager] recreateChartOptions called but chart is not initialized');
      return;
    }
    try {
      this.chart.options.scales.y.min = this.card.config?.min_value ?? 0;
      this.chart.options.scales.y.max = this.card.config?.max_value ?? 100;
      this.chart.options.scales.x.title.text = this._getXTitle();
      this.chart.options.scales.y.title.text = this._getYTitle();
      this.chart.update();
      Logger.log('CHART', '[ChartManager] Options recreated');
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error recreating chart options: ${err?.message}`);
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + `: ${err.message}`,
        'error'
      );
    }
  }

  updateChartLabels() {
    if (!this.isInitialized()) {
      return;
    }
    try {
      const labels = this._getHourLabels();
      this.chart.data.labels = labels;
      this.chart.options.scales.x.title.text = this._getXTitle();
      this.chart.options.scales.y.title.text = this._getYTitle();
      this.chart.update();
      Logger.log('CHART', '[ChartManager] Labels and titles updated');
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error updating labels: ${err?.message}`);
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + `: ${err.message}`,
        'error'
      );
    }
  }

  updatePointStyling(anchorPoint, selectedPoints) {
    if (!this.isInitialized()) return;
    try {
      const ds = this.chart.data.datasets[0];
      const pointsCount = this.chart.data.labels?.length || 24;
      const selectedSet = new Set(Array.isArray(selectedPoints) ? selectedPoints : []);
      const radii = new Array(pointsCount).fill(5);
      const hoverRadii = new Array(pointsCount).fill(8);
      const bg = new Array(pointsCount).fill(COLORS.primary);
      const border = new Array(pointsCount).fill(COLORS.primary);

      for (let i = 0; i < pointsCount; i++) {
        if (i === anchorPoint) {
          radii[i] = 8;
          hoverRadii[i] = 10;
          bg[i] = COLORS.anchor;
          border[i] = COLORS.anchorDark;
        } else if (selectedSet.has(i)) {
          radii[i] = 7;
          hoverRadii[i] = 9;
          bg[i] = COLORS.selected;
          border[i] = COLORS.selectedDark;
        }
      }

      ds.pointRadius = radii;
      ds.pointHoverRadius = hoverRadii;
      ds.pointBackgroundColor = bg;
      ds.pointBorderColor = border;

      this.chart.update('none');
      Logger.log('CHART', '[ChartManager] Point styling updated (anchor/selection)');
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error updating point styling: ${err?.message}`);
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + `: ${err.message}`,
        'error'
      );
    }
  }

  showDragValueDisplay(indices, data) {
    const disp = this.card.shadowRoot?.getElementById('drag-value-display');
    const container = this.card.shadowRoot?.querySelector('.chart-container');
    if (!disp || !container || !this.isInitialized()) return;
    try {
      const idx = Array.isArray(indices) && indices.length > 0 ? indices[0] : null;
      const val = idx !== null ? data[idx] : null;
      disp.textContent = val !== null && val !== undefined ? String(val) : '';
      disp.style.display = 'block';
      const rect = container.getBoundingClientRect();
      disp.style.left = `${Math.max(8, rect.width / 2 - 20)}px`;
      disp.style.top = `${Math.max(8, rect.height / 2 - 20)}px`;
      this._clearHideTimer();
    } catch (e) {
      Logger.warn('CHART', '[ChartManager] showDragValueDisplay failed:', e); // Changed to error, previously warn
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + `: ${e.message}`,
        'error'
      );
    }
  }

  scheduleHideDragValueDisplay(delayMs = 2000) {
    try {
      this._clearHideTimer();
      this._hideTimer = setTimeout(() => {
        this.hideDragValueDisplay();
      }, delayMs);
    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error in scheduleHideDragValueDisplay:', e);
    }
  }

  hideDragValueDisplay() {
    try {
      const disp = this.card.shadowRoot?.getElementById('drag-value-display');
      if (disp) {
        disp.style.display = 'none';
      }
      this._clearHideTimer();
    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error in hideDragValueDisplay:', e);
    }
  }

  _clearHideTimer() {
    try {
      if (this._hideTimer) {
        clearTimeout(this._hideTimer);
        this._hideTimer = null;
      }
    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error in _clearHideTimer:', e);
    }
  }

  update() {
    if (this.isInitialized()) {
      try {
        this.chart.update();
      } catch (e) {
        Logger.error('CHART', '[ChartManager] Error in chart.update():', e);
        this.card.eventHandlers.showNotification(
          this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + `: ${e.message}`,
          'error'
        );
      }
    }
  }

  destroy() {
    try {
      if (this.chart?.destroy) {
        this.chart.destroy();
      }
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error destroying chart: ${err?.message}`); // Changed to error, previously warn
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + `: ${err.message}`,
        'error'
      );
    } finally {
      this.chart = null;
      this._initialized = false;
      this._clearHideTimer();
      Logger.log('CHART', '[ChartManager] Chart destroyed');
    }
  }
}