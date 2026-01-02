import Chart from 'chart.js/auto';
import dragDataPlugin from 'chartjs-plugin-dragdata';
import zoomPlugin from 'chartjs-plugin-zoom';

import { Logger, timeToMinutes, minutesToTime } from '../utils.js';
import { Events } from '../core/EventBus.js';
import { COLORS } from '../config.js';

export class ChartManager {
  constructor(context) {
    this.context = context;
    this.chart = null;
    this.canvas = null;

    // Interaction state
    this._isDragging = false;
    this._dragPointIndex = null;
    this._lastHoverIndex = null;

    // Debounce timers
    this._updateTimer = null;

    this._setupEventListeners();
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen for state changes
    this.context.events.on(Events.SCHEDULE_UPDATED, (data) => {
      this._scheduleChartUpdate();
    });

    // Listen for selection changes
    this.context.events.on(Events.SELECTION_CHANGED, (data) => {
      this._updatePointStyles();
    });
  }

  /**
   * Initialize chart
   * @param {HTMLCanvasElement} canvas - Canvas element
   */
  async initChart(canvas) {
    this.canvas = canvas;

    const stateManager = this.context.getManager('state');
    if (!stateManager) {
      Logger.error('CHART', 'StateManager not available');
      return;
    }

    // Build chart data
    const chartData = this._buildChartData(stateManager.getData());

    // Chart configuration
    const config = {
      type: 'line',
      data: chartData,
      options: this._buildChartOptions(),
      plugins: [dragDataPlugin, zoomPlugin]
    };

    // Create chart
    if (this.chart) {
      this.chart.destroy();
    }
    this.chart = new Chart(canvas, config);

    // Setup ResizeObserver for smooth resizing during expansion transitions
    this._setupResizeObserver(canvas.parentElement);

    this.context.events.emit(Events.CHART_READY);
    Logger.chart('Chart initialized');
  }

  /**
   * Build chart data from schedule
   * @private
   * @param {Array} schedule - Schedule data
   * @returns {Object} Chart.js data
   */
  _buildChartData(schedule) {
    const config = this.context.config || {};
    const minValue = config.min_value ?? 0;
    const maxValue = config.max_value ?? 30;

    // Convert to chart points
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
        fill: true,
        tension: 0,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: COLORS.primary,
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }]
    };
  }

  /**
   * Build chart options
   * @private
   * @returns {Object} Chart.js options
   */
  _buildChartOptions() {
    const config = this.context.config || {};
    const isSwitch = !!config.is_switch_preset;
    const minValue = isSwitch ? 0 : (config.min_value ?? 0);
    const maxValue = isSwitch ? 1 : (config.max_value ?? 30);
    const step = config.step_value || 0.5;

    return {
      responsive: true,
      maintainAspectRatio: false,
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
            stepSize: 60,
            callback: (value) => minutesToTime(value)
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          title: {
            display: true,
            text: 'Time'
          }
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
              // Force exactly 1 decimal place for consistency
              return `${value.toFixed(1)}${config.unit_of_measurement || ''}`;
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          },
          title: {
            display: true,
            text: config.y_axis_label || 'Value'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: false // Disable native tooltips to use custom hover display
        },
        zoom: {
          pan: {
            enabled: () => !this._isDragging, // Disable during drag
            onPanStart: (ctx) => {
              if (this._isDragging || this.context._card.isDragging) return false;
              return true;
            },
            mode: (ctx) => {
              const { chart, point } = ctx;
              if (!point) return 'x';
              const { chartArea } = chart;
              if (point.x < chartArea.left) return 'y';
              if (point.y > chartArea.bottom) return 'x';
              return 'x';
            }
          },
          zoom: {
            wheel: { enabled: () => !this._isDragging, speed: 0.05 },
            pinch: { enabled: () => !this._isDragging },
            onZoomStart: (ctx) => {
              if (this._isDragging) return false;
              return true;
            },
            mode: (ctx) => {
              const { chart, point } = ctx;
              if (!point) return 'x';
              const { chartArea } = chart;
              if (point.x < chartArea.left) return 'y';
              if (point.y > chartArea.bottom) return 'x';
              return 'x';
            },
            onZoom: ({ chart }) => {
              // Handled by ResizeObserver
            }
          },
          limits: {
            x: { min: 0, max: 1440 },
            y: { min: isSwitch ? -0.1 : minValue, max: isSwitch ? 1.1 : maxValue }
          }
        },
        dragData: {
          round: isSwitch ? 0 : 1,
          showTooltip: true,
          dragX: true,
          onDragStart: (e, datasetIndex, index, value) => {
            this._isDragging = true;
            this.context.hasUnsavedChanges = true;
            this.context._card.isDragging = true;
            this._dragPointIndex = index;

            // Group dragging support: capture initial offsets
            const selectionManager = this.context.getManager('selection');
            const selectedIndices = selectionManager?.getSelectedPoints() || [];
            
            // If the dragged point isn't selected, select it (exclusive)
            if (!selectedIndices.includes(index)) {
              selectionManager.selectPoint(index);
              this._updatePointStyles();
            }

            const activeIndices = selectionManager?.getSelectedPoints() || [index];
            const data = this.chart.data.datasets[datasetIndex].data;
            const pivot = data[index];

            // 1. Capture group offsets and find extent relative to pivot
            let minDx = 0;
            let maxDx = 0;
            this._dragOffsets = activeIndices.map(idx => {
              const dx = data[idx].x - pivot.x;
              const dy = data[idx].y - pivot.y;
              if (dx < minDx) minDx = dx;
              if (dx > maxDx) maxDx = dx;
              return { idx, dx, dy };
            });

            // 2. Determine non-selected neighbor boundaries for the WHOLE group
            // We must find neighbors in time-sorted space
            const sortedPoints = data.map((p, i) => ({ idx: i, x: Number(p.x) })).sort((a, b) => a.x - b.x);
            const selectedSet = new Set(activeIndices);
            
            let leftLimit = 0;
            let rightLimit = 1439;

            const firstSortedSelectedIdx = sortedPoints.findIndex(item => selectedSet.has(item.idx));
            if (firstSortedSelectedIdx > 0) {
              leftLimit = sortedPoints[firstSortedSelectedIdx - 1].x + 1;
            }

            let lastSortedSelectedIdx = -1;
            for (let i = sortedPoints.length - 1; i >= 0; i--) {
              if (selectedSet.has(sortedPoints[i].idx)) {
                lastSortedSelectedIdx = i;
                break;
              }
            }
            if (lastSortedSelectedIdx !== -1 && lastSortedSelectedIdx < sortedPoints.length - 1) {
              rightLimit = sortedPoints[lastSortedSelectedIdx + 1].x - 1;
            }

            // Group-wide movement limits for the PIVOT point
            this._dragConstraints = {
              minPivotX: leftLimit - minDx,
              maxPivotX: rightLimit - maxDx,
              leftLimit,
              rightLimit
            };

            return true;
          },
          onDrag: (e, datasetIndex, index, value) => {
            if (!this.chart || !this._dragOffsets || !this._dragConstraints) return;
            const pos = this._getCanvasRelativePosition(e);
            const xScale = this.chart.scales.x;
            const yScale = this.chart.scales.y;
            
            // Mouse-derived proposed pivot X
            let pivotNewX = xScale.getValueForPixel(pos.x);
            
            // Constrain Pivot X based on group boundaries
            pivotNewX = Math.max(this._dragConstraints.minPivotX, Math.min(this._dragConstraints.maxPivotX, pivotNewX));
            
            // Final snap and global chart limits
            pivotNewX = Math.round(pivotNewX / 5) * 5;
            pivotNewX = Math.max(0, Math.min(1440, pivotNewX));

            let pivotNewY = yScale.getValueForPixel(pos.y);
            if (isSwitch) {
              pivotNewY = pivotNewY >= 0.5 ? 1 : 0;
            } else {
              pivotNewY = Math.round(pivotNewY / step) * step;
              pivotNewY = Math.max(minValue, Math.min(maxValue, pivotNewY));
            }

            const data = this.chart.data.datasets[datasetIndex].data;

            // Apply movement to all points in group
            this._dragOffsets.forEach(off => {
              const i = off.idx;
              if (i === index) return; // Handle pivot separately via return value if possible, or update here too

              let nx = pivotNewX + off.dx;
              let ny = pivotNewY + off.dy;

              // Boundary clamps
              nx = Math.max(this._dragConstraints.leftLimit, Math.min(this._dragConstraints.rightLimit, nx));
              
              if (isSwitch) {
                ny = ny >= 0.5 ? 1 : 0;
              } else {
                ny = Math.round(ny / step) * step;
                ny = Math.max(minValue, Math.min(maxValue, ny));
              }

              // Anchors are fixed in time
              if (i === 0) nx = 0;
              if (i === data.length - 1) nx = 1439;

              data[i] = { x: nx, y: ny };
            });

            // Note: NO re-sorting during drag to keep index stability
            this.chart.update('none');

            // Update tooltip during drag
            this._updateTooltip(e, pivotNewY, pivotNewX);

            // Returning the constrained object ensures the point under mouse is also correctly positioned
            return { x: pivotNewX, y: pivotNewY };
          },
          onDragEnd: (e, datasetIndex, index, value) => {
            this._isDragging = false;
            this.context._card.isDragging = false;
            this._dragOffsets = null;
            
            const stateManager = this.context.getManager('state');
            if (stateManager) {
              const data = this.chart.data.datasets[datasetIndex].data;
              // Ensure final sort
              data.sort((a, b) => a.x - b.x);
              const schedule = data.map(p => ({
                time: minutesToTime(p.x),
                value: p.y
              }));
              stateManager.setData(schedule);
            }
          }
        }
      },
      onHover: (event, elements) => this._handleHover(event, elements),
      onClick: (event, elements) => this._handleClick(event, elements)
    };
  }

  /**
   * Handle hover events
   * @private
   */
  _handleHover(event, elements) {
    if (this._isDragging || !this.chart) return;
    
    this._updateTooltip(event.native || event);
    
    const canvas = this.canvas;
    if (canvas) {
      canvas.style.cursor = elements.length > 0 ? 'grab' : 'crosshair';
    }
    
    this._lastHoverIndex = elements.length > 0 ? elements[0].index : null;
  }

  /**
   * Updates the custom hover tooltip
   * @private
   */
  _updateTooltip(event, forcedY = null, forcedX = null) {
    const card = this.context._card;
    if (!this.chart || !card) return;

    const hoverEl = card.shadowRoot?.getElementById('hover-value-display');
    if (!hoverEl) return;

    const pos = this._getCanvasRelativePosition(event);
    const xScale = this.chart.scales.x;
    const yScale = this.chart.scales.y;

    // Check if within bounds
    const isInside = pos.x >= xScale.left && pos.x <= xScale.right && 
                     pos.y >= yScale.top && pos.y <= yScale.bottom;

    if (isInside || forcedY !== null) {
      const minutes = forcedX !== null ? forcedX : xScale.getValueForPixel(pos.x);
      const val = forcedY !== null ? forcedY : this._interpolateValueAtMinutes(minutes);
      
      if (val !== null) {
        const time = minutesToTime(minutes);
        const config = this.context.config || {};
        const isSwitch = !!config.is_switch_preset;
        
        let label;
        if (isSwitch) {
          label = `${time} - ${val >= 0.5 ? 'ON' : 'OFF'}`;
        } else {
          const unit = config.unit_of_measurement || '';
          label = `${time} - ${val.toFixed(1)}${unit}`;
        }

        hoverEl.textContent = label;
        hoverEl.style.display = 'block';
        
        // Position relative to canvas
        const tooltipWidth = hoverEl.offsetWidth || 100;
        let left = pos.x + 15;
        if (left + tooltipWidth > this.canvas.offsetWidth) {
          left = pos.x - tooltipWidth - 15;
        }
        
        hoverEl.style.left = `${left}px`;
        hoverEl.style.top = `${pos.y - 30}px`;
      } else {
        hoverEl.style.display = 'none';
      }
    } else {
      hoverEl.style.display = 'none';
    }
  }

  /**
   * Handle click events
   * @private
   */
  _handleClick(event, elements) {
    // Check for click suppression (e.g. after area selection)
    if (Date.now() < (this.context._card.suppressClickUntil || 0)) {
      return;
    }

    const selectionManager = this.context.getManager('selection');
    const stateManager = this.context.getManager('state');
    if (!selectionManager || !stateManager) return;

    // Alt + Click Alignment logic
    if (event.native.altKey) {
      event.native.preventDefault();
      event.native.stopPropagation();
      stateManager.alignSelectedPoints('left');
      this._updatePointStyles();
      return;
    }

    // Use intersect: true to see if we hit a point directly.
    // The global interaction options have intersect: false, which makes 'elements'
    // always contain the nearest point even if we click far from it.
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
          
          if (interpolatedY !== null) {
            const pixelY = yScale.getPixelForValue(interpolatedY);
            if (Math.abs(pos.y - pixelY) < 25) {
              const time = minutesToTime(minutes);
              let value = yScale.getValueForPixel(pos.y);
              const config = this.context.config || {};
              const isSwitch = !!config.is_switch_preset;
              
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

  /**
   * Schedule chart update with debounce
   * @private
   */
  _scheduleChartUpdate() {
    if (this._updateTimer) clearTimeout(this._updateTimer);
    this._updateTimer = setTimeout(() => { this._updateChartData(); }, 16);
  }

  /**
   * Update chart data
   * @private
   */
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

  /**
   * Update point styles based on selection
   * @private
   */
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

  /**
   * Setup ResizeObserver to handle smooth chart resizing
   * @private
   */
  _setupResizeObserver(container) {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      if (this.chart) {
        // Request animation frame to ensure we resize in sync with browser paints
        requestAnimationFrame(() => {
          if (this.chart) this.chart.resize();
        });
      }
    });
    this._resizeObserver.observe(container);
  }

  /**
   * Destroy chart
   */
  destroy() {
    if (this._updateTimer) clearTimeout(this._updateTimer);
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    this.canvas = null;
    this.context.events.emit(Events.CHART_DESTROYED);
    Logger.chart('Chart destroyed');
  }

  // Public API Compatibility
  isInitialized() { return !!this.chart; }
  getChart() { return this.chart; }
  updateData(schedule) { this._updateChartData(); }
  recreateChartOptions() { if (this.chart) { this.chart.options = this._buildChartOptions(); this.chart.update('none'); } }
  updateChartLabels() { this.recreateChartOptions(); }
  update(mode) { if (this.chart) this.chart.update(mode); }
  updatePointStyling(index, indices) { this._updatePointStyles(); }
  showDragValueDisplay(value, minutes) { }
  scheduleHideDragValueDisplay(delay) { }
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
    if (!this.canvas || !evt) return { x: 0, y: 0 };
    
    // If it's already a Chart.js event with x/y relative to canvas
    if (typeof evt.x === 'number' && typeof evt.y === 'number' && !evt.clientX && !evt.native) {
      return { x: evt.x, y: evt.y };
    }

    const rect = this.canvas.getBoundingClientRect();
    const clientX = evt.clientX || (evt.native && evt.native.clientX) || (evt.touches && evt.touches[0]?.clientX) || 0;
    const clientY = evt.clientY || (evt.native && evt.native.clientY) || (evt.touches && evt.touches[0]?.clientY) || 0;
    
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _interpolateValueAtMinutes(minutes) {
    if (!this.chart) return null;
    const ds = this.chart.data.datasets[0].data || [];
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
}
