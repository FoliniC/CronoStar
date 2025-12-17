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
    this._hideTimer = null;
    this.lastMousePosition = null;
  }

  isInitialized() {
    return this._initialized && !!this.chart;
  }

  getChart() {
    return this.chart;
  }

  _getXTitle() {
    return this.card.localizationManager.localize(this.card.language, 'ui.time_label');
  }

  _getYTitle() {
    return this.card.config?.y_axis_label || 
           this.card.localizationManager.localize(this.card.language, 'ui.temperature_label');
  }

  /**
   * Generate labels from schedule data
   */
  _generateLabels() {
    return this.card.stateManager.scheduleData.map(p => p.time);
  }

  initChart(canvas) {
    if (!canvas) {
      Logger.error('CHART', '[ChartManager] initChart: canvas is null');
      return false;
    }
    
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.lastMousePosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    });
    
    // Context menu handler for point deletion
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._handleContextMenu(e);
    });
    
    try {
      const ctx = canvas.getContext('2d');
      const step = this.card.config?.step_value ?? 1;
      const minV = this.card.config?.min_value ?? 0;
      const maxV = this.card.config?.max_value ?? 100;
      
      const dataArr = this.card.stateManager.scheduleData.map(p => ({
        x: this.card.stateManager.timeToMinutes(p.time),
        y: p.value
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
            pointRadius: 5,
            pointHoverRadius: 8,
            pointHitRadius: 12,
            pointBackgroundColor: COLORS.primary,
            pointBorderColor: COLORS.primary,
            borderWidth: 2,
            tension: 0, // Straight lines for clearer schedule segments
            spanGaps: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          interaction: {
            mode: 'nearest',
            intersect: true
          },
          onClick: (evt) => this._handleChartClick(evt),
          plugins: {
            legend: { display: true },
            zoom: {
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: ({ chart }) => {
                   if (!this.lastMousePosition) return 'x';
                   const { x, y } = this.lastMousePosition;
                   const scaleX = chart.scales.x;
                   const scaleY = chart.scales.y;
                   
                   if (x < scaleX.left) return 'y';
                   if (y > scaleY.bottom) return 'x';
                   return 'x';
                },
              },
              pan: {
                enabled: true,
                mode: 'x',
              },
              limits: {
                x: { min: 0, max: 1440 }, // Limit to 24h
              }
            },
            tooltip: { 
              enabled: true,
              callbacks: {
                title: (context) => {
                  const minutes = context[0].parsed.x;
                  return this.card.stateManager.minutesToTime(minutes);
                }
              }
            },
            dragData: {
              round: step,
              showTooltip: true,
              dragX: false,
              onDragStart: (e, datasetIndex, index, value) => {
                if (e.shiftKey || this.card.keyboardHandler?.shiftDown) return false;
                
                // value is usually the Y value for dragX: false
                Logger.log('DRAG', `[ChartManager] Drag start idx=${index}, value=${value}`);
                
                this.dragStartValue = value;
                this.dragStartIndex = index;
                this.initialSelectedValues = {};
                
                const selMgr = this.card.selectionManager;
                const pointsToMove = (selMgr && selMgr.isSelected(index)) 
                  ? selMgr.getSelectedPoints() 
                  : [index];
                
                pointsToMove.forEach(i => {
                   const pointObj = this.chart.data.datasets[datasetIndex].data[i];
                   // data[i] is {x, y}
                   this.initialSelectedValues[i] = pointObj.y;
                });

                const disp = this.card.shadowRoot?.getElementById('drag-value-display');
                if (disp) disp.style.display = 'block';
                
                this.card.isDragging = true;
                this.card.lastEditAt = Date.now();
                this.card.awaitingAutomation = false;
                this.card.outOfSyncDetails = "";
                this._clearHideTimer();
                this.card.requestUpdate();
              },
              onDrag: (e, datasetIndex, index, value) => {
                const clamped = clamp(value);
                const ds = this.chart.data.datasets[datasetIndex];
                const delta = clamped - this.dragStartValue;
                
                const selMgr = this.card.selectionManager;
                const pointsToUpdate = (selMgr && selMgr.isSelected(index)) 
                  ? selMgr.getSelectedPoints() 
                  : [index];
                
                pointsToUpdate.forEach(i => {
                   if (!Number.isInteger(i)) return;
                   
                   let initial = this.initialSelectedValues[i];
                   if (initial === undefined) {
                     // Fallback if not captured in Start
                     initial = ds.data[i]?.y || 0;
                     this.initialSelectedValues[i] = initial;
                   }
                   
                   let newVal = initial + delta;
                   newVal = clamp(newVal); 
                   newVal = Math.round(newVal / step) * step;
                   
                   // Update chart data object directly
                   if (ds.data[i]) {
                       ds.data[i].y = newVal;
                   }
                   
                   if (this.card.stateManager) {
                     this.card.stateManager.updatePoint(i, newVal);
                   }
                });
                
                this.card.hasUnsavedChanges = true;
                const disp = this.card.shadowRoot?.getElementById('drag-value-display');
                if (disp) {
                  // value is the Y value being dragged
                  disp.textContent = String(ds.data[index]?.y ?? value);
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
                
                // Optimize schedule
                this.card.stateManager.optimizeSchedule();
                
                if (this.card.selectedProfile) {
                    this.card.profileManager.saveProfile(this.card.selectedProfile)
                        .catch(err => Logger.error('DRAG', 'Auto-save failed:', err));
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              display: true,
              min: 0,
              max: 1440, // 24 hours in minutes
              title: { display: true, text: this._getXTitle() },
              grid: { display: true },
              ticks: {
                stepSize: 60, // Every hour
                callback: (value) => {
                  // Convert minutes to HH:MM
                  const h = Math.floor(value / 60);
                  const m = value % 60;
                  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                }
              }
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
      Logger.log('CHART', `[ChartManager] Chart initialized with ${dataArr.length} points`);
      this.updatePointStyling(
        this.card.selectionManager?.selectedPoint ?? null, 
        this.card.selectionManager?.selectedPoints ?? []
      );
      return true;
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Failed to initialize chart: ${err?.message}`);
      this._initialized = false;
      this.chart = null;
      return false;
    }
  }

  /**
   * Handle chart click to insert points
   */
  _handleChartClick(evt) {
    const points = this.chart.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true);
    
    if (points.length > 0) return; // Clicked on existing point
    
    // Get click position
    const canvasPosition = Chart.helpers.getRelativePosition(evt, this.chart);
    const xMinutes = this.chart.scales.x.getValueForPixel(canvasPosition.x);
    const yValue = this.chart.scales.y.getValueForPixel(canvasPosition.y);
    
    if (xMinutes === undefined || yValue === undefined) return;
    
    // Convert minutes to HH:MM (snap to 10 mins or 15 mins? Use 5 mins for now)
    // Actually, let's just round to nearest minute
    let minutes = Math.round(xMinutes);
    minutes = Math.max(0, Math.min(1439, minutes));
    
    const timeStr = this.card.stateManager.minutesToTime(minutes);
    
    // Insert new point
    const insertedIndex = this.card.stateManager.insertPoint(timeStr, yValue);
    
    // Update chart
    this.updateData(this.card.stateManager.getData());
    
    // Select new point
    this.card.selectionManager.selectIndices([insertedIndex], false);
    this.updatePointStyling(
      insertedIndex,
      [insertedIndex]
    );
    
    Logger.log('CHART', `Inserted point at ${timeStr} = ${yValue}`);
  }

  /**
   * Handle context menu (right-click) to delete points
   */
  _handleContextMenu(evt) {
    const points = this.chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
    
    if (points.length === 0) return;
    
    const index = points[0].index;
    
    // Remove point
    if (this.card.stateManager.removePoint(index)) {
      this.updateData(this.card.stateManager.getData());
      this.card.selectionManager.clearSelection();
      Logger.log('CHART', `Removed point at index ${index}`);
    }
  }

  updateData(dataArr) {
    if (!this.isInitialized()) {
      Logger.warn('CHART', '[ChartManager] updateData called but chart not initialized');
      return;
    }
    try {
      const scheduleData = this.card.stateManager.scheduleData;
      // We don't set labels for linear scale X
      
      // Update data with {x, y} objects
      this.chart.data.datasets[0].data = scheduleData.map(p => ({
          x: this.card.stateManager.timeToMinutes(p.time),
          y: p.value
      }));
      
      this.updatePointStyling(
        this.card.selectionManager?.selectedPoint ?? null, 
        this.card.selectionManager?.selectedPoints ?? []
      );
      this.chart.update();
      Logger.log('CHART', '[ChartManager] Data updated');
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error updating data: ${err?.message}`);
    }
  }

  updatePointStyling(anchorPoint, selectedPoints) {
    if (!this.isInitialized()) return;
    try {
      const ds = this.chart.data.datasets[0];
      const pointsCount = this.card.stateManager.scheduleData.length;
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
      Logger.log('CHART', '[ChartManager] Point styling updated');
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error updating point styling: ${err?.message}`);
    }
  }

  recreateChartOptions() {
    if (!this.isInitialized()) return;
    try {
      this.chart.options.scales.y.min = this.card.config?.min_value ?? 0;
      this.chart.options.scales.y.max = this.card.config?.max_value ?? 100;
      this.chart.options.scales.x.title.text = this._getXTitle();
      this.chart.options.scales.y.title.text = this._getYTitle();
      this.chart.update();
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error recreating options: ${err?.message}`);
    }
  }

  updateChartLabels() {
    // With linear scale, we just update title
    if (!this.isInitialized()) return;
    try {
      this.chart.options.scales.x.title.text = this._getXTitle();
      this.chart.options.scales.y.title.text = this._getYTitle();
      this.chart.update();
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error updating labels: ${err?.message}`);
    }
  }

  showDragValueDisplay(indices, data) {
    const disp = this.card.shadowRoot?.getElementById('drag-value-display');
    const container = this.card.shadowRoot?.querySelector('.chart-container');
    if (!disp || !container || !this.isInitialized()) return;
    try {
      const idx = Array.isArray(indices) && indices.length > 0 ? indices[0] : null;
      // data might be array of values or objects depending on what StateManager returns from getData()
      // StateManager.getData() returns array of numbers (values).
      // So 'data' passed here is array of numbers.
      const val = idx !== null ? data[idx] : null;
      disp.textContent = val !== null && val !== undefined ? String(val) : '';
      disp.style.display = 'block';
      const rect = container.getBoundingClientRect();
      disp.style.left = `${Math.max(8, rect.width / 2 - 20)}px`;
      disp.style.top = `${Math.max(8, rect.height / 2 - 20)}px`;
      this._clearHideTimer();
    } catch (e) {
      Logger.warn('CHART', '[ChartManager] showDragValueDisplay failed:', e);
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
      if (disp) disp.style.display = 'none';
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
      }
    }
  }

  destroy() {
    try {
      if (this.chart?.destroy) {
        this.chart.destroy();
      }
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error destroying chart: ${err?.message}`);
    } finally {
      this.chart = null;
      this._initialized = false;
      this._clearHideTimer();
      Logger.log('CHART', '[ChartManager] Chart destroyed');
    }
  }
}