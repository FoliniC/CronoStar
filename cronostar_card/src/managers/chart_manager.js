/** Chart Manager for CronoStar Card with Dynamic Intervals */
import Chart from 'chart.js/auto';
import dragDataPlugin from 'chartjs-plugin-dragdata';
import zoomPlugin from 'chartjs-plugin-zoom';
import { COLORS, TIMEOUTS, getPointsCount } from '../config.js';
import { Logger } from '../utils.js';

Chart.register(dragDataPlugin, zoomPlugin);

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
      return this.card.config?.y_axis_label || 
             this.card.localizationManager.localize(this.card.language, 'ui.temperature_label');
    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error in _getYTitle:', e);
      return 'Value';
    }
  }

  /**
   * Generate labels based on interval
   * @returns {Array<string>}
   */
  _generateLabels() {
    try {
      const interval = this.card.config?.interval_minutes || 60;
      const numPoints = getPointsCount(interval);
      const labels = [];
      
      for (let i = 0; i < numPoints; i++) {
        labels.push(this.card.stateManager.getPointLabel(i));
      }
      
      return labels;
    } catch (e) {
      Logger.error('CHART', '[ChartManager] Error generating labels:', e);
      return [...Array(24)].map((_, i) => `${i.toString().padStart(2, '0')}:00`);
    }
  }

  /**
   * Configure label decimation based on number of points
   * @param {number} numPoints - Number of data points
   * @returns {Object} X-axis tick configuration
   */
  _getTickConfig(numPoints) {
    if (numPoints <= 24) {
      // Show all labels for 24 or fewer points
      return {
        maxRotation: 45,
        minRotation: 0,
        autoSkip: false
      };
    } else if (numPoints <= 48) {
      // Show every other label
      return {
        maxRotation: 45,
        minRotation: 0,
        autoSkip: true,
        maxTicksLimit: 24
      };
    } else if (numPoints <= 96) {
      // Show every 4th label
      return {
        maxRotation: 45,
        minRotation: 0,
        autoSkip: true,
        maxTicksLimit: 24
      };
    } else {
      // Show hourly marks for very dense schedules
      return {
        maxRotation: 45,
        minRotation: 0,
        autoSkip: true,
        maxTicksLimit: 24,
        callback: function(value, index, ticks) {
          // Show only hour marks (xx:00)
          const label = this.getLabelForValue(value);
          return label && label.endsWith(':00') ? label : '';
        }
      };
    }
  }

  initChart(canvas) {
    if (!canvas) {
      Logger.error('CHART', '[ChartManager] initChart: canvas is null/undefined');
      return false;
    }
    
    // Track mouse position for dynamic zoom mode
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.lastMousePosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    });
    
    try {
      const ctx = canvas.getContext('2d');
      const step = this.card.config?.step_value ?? 1;
      const minV = this.card.config?.min_value ?? 0;
      const maxV = this.card.config?.max_value ?? 100;
      
      const numPoints = getPointsCount(this.card.config?.interval_minutes || 60);
      const dataArr = Array.isArray(this.card.stateManager?.scheduleData)
        ? this.card.stateManager.scheduleData.map(v => (v == null ? null : Number(v)))
        : new Array(numPoints).fill(null);
      
      const labels = this._generateLabels();
      const tickConfig = this._getTickConfig(numPoints);
      
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
              pointRadius: numPoints > 96 ? 2 : 5,  // Smaller points for dense schedules
              pointHoverRadius: numPoints > 96 ? 4 : 8,
              pointHitRadius: numPoints > 96 ? 6 : 12,
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
            zoom: {
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: ({ chart }) => {
                   if (!this.lastMousePosition) return 'x';
                   const { x, y } = this.lastMousePosition;
                   const scaleX = chart.scales.x;
                   const scaleY = chart.scales.y;
                   
                   // If within Y axis area (left of X scale left edge)
                   if (x < scaleX.left) return 'y';
                   // If within X axis area (below Y scale bottom edge)
                   if (y > scaleY.bottom) return 'x';
                   
                   // Default to x inside chart area
                   return 'x';
                },
              },
              pan: {
                enabled: true,
                mode: 'x',
              },
              limits: {
                x: { min: 'original', max: 'original' },
              }
            },
            tooltip: { 
              enabled: true,
              callbacks: {
                title: (context) => {
                  const index = context[0].dataIndex;
                  return this.card.stateManager.getPointLabel(index);
                }
              }
            },
            dragData: {
              round: step,
              showTooltip: true,
              dragX: false,
              onDragStart: (e, datasetIndex, index, value) => {
                // Prevent drag if Shift is pressed (area selection)
                if (e.shiftKey || this.card.keyboardHandler?.shiftDown) return false;
                
                // Check if click is strictly within the chart area (exclude scales)
                const chart = this.chart;
                const scaleX = chart.scales.x;
                const scaleY = chart.scales.y;
                
                let clientX = e.clientX;
                let clientY = e.clientY;
                // Handle touch events if applicable
                if (e.changedTouches && e.changedTouches.length > 0) {
                    clientX = e.changedTouches[0].clientX;
                    clientY = e.changedTouches[0].clientY;
                } else if (e.nativeEvent) {
                    // Sometimes wrapper events
                    clientX = e.nativeEvent.clientX || clientX;
                    clientY = e.nativeEvent.clientY || clientY;
                }
                
                if (clientX !== undefined && clientY !== undefined) {
                    const rect = chart.canvas.getBoundingClientRect();
                    const x = clientX - rect.left;
                    const y = clientY - rect.top;
                    
                    if (x < scaleX.left || x > scaleX.right || y < scaleY.top || y > scaleY.bottom) {
                        return false;
                    }
                }
                
                Logger.log('DRAG', `[ChartManager] Drag start idx=${index}, value=${value}`);
                
                // Store initial values for multi-drag
                this.dragStartValue = value;
                this.dragStartIndex = index;
                this.initialSelectedValues = {};
                this.draggedIndices = new Set(); // Track modified indices
                
                const selMgr = this.card.selectionManager;
                // If dragging a selected point, move all selected points
                const pointsToMove = (selMgr && selMgr.isSelected(index)) 
                  ? selMgr.getSelectedPoints() 
                  : [index];
                
                // Save initial values
                pointsToMove.forEach(i => {
                   const val = this.chart.data.datasets[datasetIndex].data[i];
                   this.initialSelectedValues[i] = val;
                });

                const disp = this.card.shadowRoot?.getElementById('drag-value-display');
                if (disp) {
                  disp.style.display = 'block';
                }
                this.card.isDragging = true;
                this.card.lastEditAt = Date.now();
                this.card.awaitingAutomation = false;
                this.card.outOfSyncDetails = "";
                this.card.cardSync.scheduleAutomationOverlaySuppression(TIMEOUTS.automationSuppression);
                this._clearHideTimer();
                this.card.requestUpdate();
              },
              onDrag: (e, datasetIndex, index, value) => {
                // value is the raw value where the user dragged to
                const clamped = clamp(value);
                const ds = this.chart.data.datasets[datasetIndex];
                
                // Calculate delta based on rounded values
                const delta = clamped - this.dragStartValue;
                
                const selMgr = this.card.selectionManager;
                const pointsToUpdate = (selMgr && selMgr.isSelected(index)) 
                  ? selMgr.getSelectedPoints() 
                  : [index];
                
                // Apply delta to all points
                pointsToUpdate.forEach(i => {
                   if (!Number.isInteger(i)) return;
                   
                   let initial = this.initialSelectedValues[i];
                   if (initial === undefined) {
                     // Fallback if missing
                     initial = ds.data[i] || 0;
                     this.initialSelectedValues[i] = initial;
                   }
                   
                   let newVal = initial + delta;
                   newVal = clamp(newVal); 
                   // Round to step
                   newVal = Math.round(newVal / step) * step;
                   
                   ds.data[i] = newVal;
                   if (this.card.stateManager) {
                     this.card.stateManager.updatePoint(i, newVal);
                   }
                });
                
                this.card.hasUnsavedChanges = true;
                const disp = this.card.shadowRoot?.getElementById('drag-value-display');
                if (disp) {
                  disp.textContent = String(ds.data[index]); // Show value of the point under cursor
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
                this.card.cardSync.scheduleAutomationOverlaySuppression(TIMEOUTS.automationSuppression);
                
                // Immediately save the profile to backend
                if (this.card.selectedProfile) {
                    this.card.profileManager.saveProfile(this.card.selectedProfile)
                        .catch(err => Logger.error('DRAG', 'Auto-save failed:', err));
                } else {
                    Logger.warn('DRAG', 'No profile selected, cannot auto-save.');
                    this.card.hasUnsavedChanges = true;
                }
                
                try {
                  this.card.cardSync.updateAutomationSync(this.card._hass);
                } catch (e) { 
                  Logger.warn('DRAG', 'Error updating automation sync on drag end:', e); 
                }
              }
            }
          },
          scales: {
            x: {
              display: true,
              title: { display: true, text: this._getXTitle() },
              grid: { display: numPoints <= 24 },  // Hide grid for dense schedules
              ticks: tickConfig
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
      Logger.log('CHART', `[ChartManager] Chart initialized with ${numPoints} points (${this.card.config.interval_minutes}min interval)`);
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
   * Rebuild chart when interval changes
   */
  async rebuildChart() {
    const canvas = this.card.shadowRoot?.getElementById("myChart");
    if (!canvas) {
      Logger.error('CHART', '[ChartManager] Cannot rebuild: canvas not found');
      return false;
    }
    
    // Destroy existing chart
    this.destroy();
    
    // Reinitialize state manager
    this.card.stateManager._initializeScheduleData();
    
    // Recreate chart
    const success = await this.initChart(canvas);
    
    if (success) {
      // Update from HA states
      this.card.stateManager.updateFromHass(this.card._hass);
      this.updateData(this.card.stateManager.getData());
    }
    
    return success;
  }

  updateData(dataArr) {
    if (!this.isInitialized()) {
      Logger.warn('CHART', '[ChartManager] updateData called but chart is not initialized');
      return;
    }
    try {
      const normalized = Array.isArray(dataArr) ? dataArr.map(v => (v == null ? null : Number(v))) : [];
      this.chart.data.datasets[0].data = normalized;
      this.updatePointStyling(
        this.card.selectionManager?.selectedPoint ?? null, 
        this.card.selectionManager?.selectedPoints ?? []
      );
      this.chart.update();
      Logger.log('CHART', '[ChartManager] Data updated');
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error updating data: ${err?.message}`);
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + 
        `: ${err.message}`,
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
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + 
        `: ${err.message}`,
        'error'
      );
    }
  }

  updateChartLabels() {
    if (!this.isInitialized()) {
      return;
    }
    try {
      const labels = this._generateLabels();
      const numPoints = labels.length;
      const tickConfig = this._getTickConfig(numPoints);
      
      this.chart.data.labels = labels;
      this.chart.options.scales.x.title.text = this._getXTitle();
      this.chart.options.scales.y.title.text = this._getYTitle();
      this.chart.options.scales.x.ticks = tickConfig;
      this.chart.update();
      Logger.log('CHART', '[ChartManager] Labels and titles updated');
    } catch (err) {
      Logger.error('CHART', `[ChartManager] Error updating labels: ${err?.message}`);
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + 
        `: ${err.message}`,
        'error'
      );
    }
  }

  updatePointStyling(anchorPoint, selectedPoints) {
    if (!this.isInitialized()) return;
    try {
      const ds = this.chart.data.datasets[0];
      const pointsCount = this.chart.data.labels?.length || getPointsCount(this.card.config?.interval_minutes || 60);
      const selectedSet = new Set(Array.isArray(selectedPoints) ? selectedPoints : []);
      const radii = new Array(pointsCount).fill(pointsCount > 96 ? 2 : 5);
      const hoverRadii = new Array(pointsCount).fill(pointsCount > 96 ? 4 : 8);
      const bg = new Array(pointsCount).fill(COLORS.primary);
      const border = new Array(pointsCount).fill(COLORS.primary);

      for (let i = 0; i < pointsCount; i++) {
        if (i === anchorPoint) {
          radii[i] = pointsCount > 96 ? 4 : 8;
          hoverRadii[i] = pointsCount > 96 ? 6 : 10;
          bg[i] = COLORS.anchor;
          border[i] = COLORS.anchorDark;
        } else if (selectedSet.has(i)) {
          radii[i] = pointsCount > 96 ? 3 : 7;
          hoverRadii[i] = pointsCount > 96 ? 5 : 9;
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
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + 
        `: ${err.message}`,
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
      Logger.warn('CHART', '[ChartManager] showDragValueDisplay failed:', e);
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + 
        `: ${e.message}`,
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
          this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + 
          `: ${e.message}`,
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
      Logger.error('CHART', `[ChartManager] Error destroying chart: ${err?.message}`);
      this.card.eventHandlers.showNotification(
        this.card.localizationManager.localize(this.card.language, 'error.chart_rendering_failed') + 
        `: ${err.message}`,
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