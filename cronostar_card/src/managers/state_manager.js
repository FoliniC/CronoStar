/** 
 * State management for CronoStar Card - Internal Memory Version
 * Removes dependency on HA input_number entities.
 * @module state-manager
 */

import { Logger, safeParseFloat, formatHourString } from '../utils.js';
import { getPointsCount } from '../config.js';

export class StateManager {
  constructor(card) {
    this.card = card;
    this.scheduleData = [];
    this.isLoadingProfile = false;
    
    // Initialize with default size
    this._initializeScheduleData();
  }

  /**
   * Initialize schedule data based on interval
   */
  _initializeScheduleData() {
    const numPoints = this.getNumPoints();
    this.scheduleData = new Array(numPoints).fill(this.card.config?.min_value || 0);
    Logger.state(`[StateManager] Initialized with ${numPoints} points`);
  }

  /**
   * Get number of points based on current interval
   * @returns {number}
   */
  getNumPoints() {
    const interval = this.card.config?.interval_minutes || 60;
    return getPointsCount(interval);
  }

  /**
   * Get time in minutes for a given index
   * @param {number} index - Point index
   * @returns {number} Time in minutes since midnight
   */
  getTimeForIndex(index) {
    const interval = this.card.config?.interval_minutes || 60;
    return index * interval;
  }

  /**
   * Get index for a given time
   * @param {number} timeMinutes - Minutes since midnight
   * @returns {number} Point index
   */
  getIndexForTime(timeMinutes) {
    const interval = this.card.config?.interval_minutes || 60;
    return Math.floor(timeMinutes / interval);
  }

  /**
   * Get current time index
   * @returns {number}
   */
  getCurrentIndex() {
    const now = new Date();
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    return this.getIndexForTime(minutesSinceMidnight);
  }

  /**
   * Get label for a point index
   * @param {number} index - Point index
   * @returns {string}
   */
  getPointLabel(index) {
    const timeMinutes = this.getTimeForIndex(index);
    const hours = Math.floor(timeMinutes / 60);
    const minutes = timeMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Get hour label (legacy, for compatibility)
   * @param {number} hour - Hour index
   * @returns {string}
   */
  getHourLabel(hour) {
    return `${formatHourString(hour, this.card.hourBase)}:00`;
  }

  /**
   * Update value for specific point in local memory
   * @param {number} index - Point index
   * @param {number} value - Value
   */
  updatePoint(index, value) {
    if (index >= 0 && index < this.scheduleData.length) {
      this.scheduleData[index] = value;
      this.card.hasUnsavedChanges = true;
      Logger.state(`[StateManager] Updated local point ${index} to ${value}`);
    }
  }

  /**
   * Get schedule data
   * @returns {Array<number>}
   */
  getData() {
    return [...this.scheduleData];
  }

  /**
   * Set schedule data
   * @param {Array<number>} data - New schedule data
   */
  setData(data) {
    this.scheduleData = [...data];
  }

  /**
   * Resize schedule data when interval changes
   */
  resizeScheduleData(newInterval) {
    const oldNumPoints = this.scheduleData.length;
    const newNumPoints = getPointsCount(newInterval);
    
    if (oldNumPoints === newNumPoints) return;
    
    Logger.state(`[StateManager] Resizing: ${oldNumPoints} -> ${newNumPoints} points`);
    
    // Interpolate or downsample as needed
    const newData = new Array(newNumPoints);
    
    for (let i = 0; i < newNumPoints; i++) {
      const newTimeMinutes = (i * newInterval);
      // Simple nearest neighbor mapping for resize
      const oldIndex = Math.floor((newTimeMinutes / 1440) * oldNumPoints);
      newData[i] = this.scheduleData[oldIndex] || this.card.config.min_value;
    }
    
    this.scheduleData = newData;
  }
}