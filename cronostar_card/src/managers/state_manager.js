// cronostar_card/src/managers/StateManager.js
/**
 * State management for schedule data
 * Handles sparse time-based schedules with undo/redo
 */

import { Logger, timeToMinutes, minutesToTime } from '../utils.js';
import { Events } from '../core/EventBus.js';

export class StateManager {
  constructor(context) {
    this.context = context;
    this.scheduleData = [];
    this.isLoadingProfile = false;

    // History management
    this._undoStack = [];
    this._redoStack = [];
    this._maxHistory = 50;

    this._initializeSchedule();
    this._setupEventListeners();
  }

  /**
   * Initialize with default schedule (boundaries only)
   * @private
   */
  _initializeSchedule() {
    const defaultValue = this.context.config?.min_value ?? 0;
    this.scheduleData = [
      { time: '00:00', value: defaultValue },
      { time: '23:59', value: defaultValue }
    ];
    this._undoStack = [];
    this._redoStack = [];

    Logger.state(`Initialized schedule with ${this.scheduleData.length} points`);
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen for config changes that require schedule reset
    this.context.events.on(Events.PRESET_CHANGED, () => {
      this._initializeSchedule();
      this.context.events.emit(Events.SCHEDULE_UPDATED, this.scheduleData);
    });
  }

  /**
   * Get current schedule data
   * @returns {Array} Copy of schedule
   */
  getData() {
    return [...this.scheduleData];
  }

  /**
   * Set schedule data with normalization
   * @param {Array} newData - Schedule data
   * @param {boolean} skipHistory - Skip history tracking
   */
  setData(newData, skipHistory = false) {
    if (!Array.isArray(newData)) {
      Logger.warn('STATE', 'setData received non-array data');
      return;
    }

    if (!skipHistory) {
      this._pushHistory();
    }

    // Normalize and validate
    this.scheduleData = this._normalizeSchedule(newData);

    // Ensure boundaries exist
    this._ensureBoundaries();

    this.context.hasUnsavedChanges = true;
    this.context.events.emit(Events.SCHEDULE_UPDATED, this.scheduleData);

    Logger.state(`Schedule updated: ${this.scheduleData.length} points`);
  }

  /**
   * Normalize schedule data
   * @private
   * @param {Array} schedule - Raw schedule data
   * @returns {Array} Normalized schedule
   */
  _normalizeSchedule(schedule) {
    const byMinute = new Map();

    schedule.forEach(item => {
      if (typeof item !== 'object' || item === null) return;

      let time, value;

      if (item.time !== undefined && item.value !== undefined) {
        time = String(item.time);
        value = Number(item.value);
      } else if (item.x !== undefined && item.y !== undefined) {
        time = minutesToTime(Number(item.x));
        value = Number(item.y);
      } else {
        return;
      }

      if (!/^\d{2}:\d{2}$/.test(time)) return;
      if (!Number.isFinite(value)) value = 0;

      const minute = timeToMinutes(time);
      byMinute.set(minute, value);
    });

    // Sort by time
    return Array.from(byMinute.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([minute, value]) => ({
        time: minutesToTime(minute),
        value
      }));
  }

  /**
   * Ensure 00:00 and 23:59 boundaries exist
   * @private
   */
  _ensureBoundaries() {
    const minutes = this.scheduleData.map(p => timeToMinutes(p.time));

    if (!minutes.includes(0)) {
      const firstValue = this.scheduleData[0]?.value ?? this.context.config?.min_value ?? 0;
      this.scheduleData.unshift({ time: '00:00', value: firstValue });
    }

    if (!minutes.includes(1439)) {
      const lastValue = this.scheduleData[this.scheduleData.length - 1]?.value ?? this.context.config?.min_value ?? 0;
      this.scheduleData.push({ time: '23:59', value: lastValue });
    }
  }

  /**
   * Insert a point at specified time
   * @param {string} time - Time in HH:MM format
   * @param {number} value - Point value
   * @returns {number} Index of inserted point
   */
  insertPoint(time, value) {
    this._pushHistory();

    const minutes = timeToMinutes(time);

    // Check if point already exists nearby
    const existingIndex = this.scheduleData.findIndex(p =>
      Math.abs(timeToMinutes(p.time) - minutes) < 2
    );

    if (existingIndex !== -1) {
      this.scheduleData[existingIndex].value = value;
      this.context.hasUnsavedChanges = true;
      this.context.events.emit(Events.POINT_UPDATED, { index: existingIndex, value });
      return existingIndex;
    }

    // Find insertion position
    let insertIndex = this.scheduleData.findIndex(p =>
      timeToMinutes(p.time) > minutes
    );

    if (insertIndex === -1) {
      insertIndex = this.scheduleData.length;
    }

    this.scheduleData.splice(insertIndex, 0, { time, value });
    this.context.hasUnsavedChanges = true;
    this.context.events.emit(Events.POINT_ADDED, { index: insertIndex, time, value });
    this.context.events.emit(Events.SCHEDULE_UPDATED, this.scheduleData);

    Logger.state(`Inserted point at ${time} = ${value}`);
    return insertIndex;
  }

  /**
   * Remove point at index
   * @param {number} index - Point index
   * @returns {boolean} Success
   */
  removePoint(index) {
    if (index < 0 || index >= this.scheduleData.length) {
      return false;
    }

    this._pushHistory();

    const removed = this.scheduleData.splice(index, 1)[0];
    this.context.hasUnsavedChanges = true;
    this.context.events.emit(Events.POINT_REMOVED, { index, point: removed });
    this.context.events.emit(Events.SCHEDULE_UPDATED, this.scheduleData);

    Logger.state(`Removed point at index ${index}`);
    return true;
  }

  /**
   * Update point value
   * @param {number} index - Point index
   * @param {number} value - New value
   */
  updatePoint(index, value) {
    if (index < 0 || index >= this.scheduleData.length) return;

    this.scheduleData[index].value = value;
    this.context.hasUnsavedChanges = true;
    this.context.events.emit(Events.POINT_UPDATED, { index, value });
    this.context.events.emit(Events.SCHEDULE_UPDATED, this.scheduleData);
  }

  /**
   * Align selected points
   * @param {string} direction - 'left' or 'right'
   * @param {Array<number>} indices - Point indices to align
   */
  alignSelectedPoints(direction, indices) {
    let targetIndices = indices;
    if (!targetIndices) {
      const selectionManager = this.context.getManager('selection');
      targetIndices = selectionManager ? selectionManager.getSelectedPoints() : [];
    }

    if (!targetIndices || targetIndices.length < 2) return;

    this._pushHistory();

    // Filter valid indices
    const validIndices = targetIndices.filter(i =>
      i >= 0 && i < this.scheduleData.length
    );

    if (validIndices.length < 2) return;

    // Get anchor value
    const sorted = [...validIndices].sort((a, b) => a - b);
    const anchorIndex = direction === 'right' ? sorted[sorted.length - 1] : sorted[0];
    const anchorValue = this.scheduleData[anchorIndex]?.value;

    if (anchorValue === undefined) return;

    // Apply to all points
    validIndices.forEach(i => {
      if (i !== anchorIndex) {
        this.scheduleData[i].value = anchorValue;
      }
    });

    this.context.hasUnsavedChanges = true;
    this.context.events.emit(Events.SCHEDULE_UPDATED, this.scheduleData);

    Logger.state(`Aligned ${validIndices.length} points to ${direction}`);
  }

  /**
   * Get number of points
   * @returns {number}
   */
  getNumPoints() {
    return this.scheduleData.length;
  }

  /**
   * Get current point index based on time
   * @returns {number}
   */
  getCurrentIndex() {
    const now = new Date();
    const target = now.getHours() * 60 + now.getMinutes();

    let bestIndex = 0;
    let bestDelta = Infinity;

    this.scheduleData.forEach((point, index) => {
      const delta = Math.abs(timeToMinutes(point.time) - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  /**
   * Get label for point
   * @param {number} index - Point index
   * @returns {string} Time label
   */
  getPointLabel(index) {
    return this.scheduleData[index]?.time ?? '00:00';
  }

  /**
   * Undo last change
   * @returns {boolean} Success
   */
  undo() {
    if (this._undoStack.length === 0) return false;

    // Save current to redo
    this._redoStack.push(JSON.stringify(this.scheduleData));

    // Restore previous
    const snapshot = this._undoStack.pop();
    this.scheduleData = JSON.parse(snapshot);

    this._syncToChart();
    return true;
  }

  /**
   * Redo last undo
   * @returns {boolean} Success
   */
  redo() {
    if (this._redoStack.length === 0) return false;

    // Save current to undo
    this._undoStack.push(JSON.stringify(this.scheduleData));

    // Restore next
    const snapshot = this._redoStack.pop();
    this.scheduleData = JSON.parse(snapshot);

    this._syncToChart();
    return true;
  }

  /**
   * Push current state to history
   * @private
   */
  _pushHistory() {
    if (this.isLoadingProfile) return;

    const snapshot = JSON.stringify(this.scheduleData);

    // Don't push if same as last
    if (this._undoStack.length > 0 &&
        this._undoStack[this._undoStack.length - 1] === snapshot) {
      return;
    }

    this._undoStack.push(snapshot);

    // Limit stack size
    if (this._undoStack.length > this._maxHistory) {
      this._undoStack.shift();
    }

    // Clear redo stack on new action
    this._redoStack = [];
  }

  /**
   * Sync state to chart
   * @private
   */
  _syncToChart() {
    this.context.events.emit(Events.SCHEDULE_UPDATED, this.scheduleData);
    this.context.hasUnsavedChanges = true;
    this.context.requestUpdate();
  }

  /**
   * Cleanup
   */
  destroy() {
    this._undoStack = [];
    this._redoStack = [];
  }
}
