import { Logger } from '../utils.js';

export class StateManager {
  constructor(card) {
    this.card = card;
    // Schedule now is array of {time: "HH:MM", value: number}
    this.scheduleData = [];
    this.isLoadingProfile = false;

    this._initializeScheduleData();
  }

  /**
   * Initialize schedule with default 24 hourly points
   */
  _initializeScheduleData() {
    const defaultValue = this.card.config?.min_value || 0;
    this.scheduleData = [];

    for (let h = 0; h < 24; h++) {
      this.scheduleData.push({
        time: `${h.toString().padStart(2, '0')}:00`,
        value: defaultValue
      });
    }

    Logger.state(`[StateManager] Initialized with ${this.scheduleData.length} points`);
  }

  /**
   * Get total number of points based on current configuration or default
   */
  getNumPoints() {
    const interval = this.card.config?.interval_minutes || 60;
    return Math.floor(1440 / interval);
  }

  /**
   * Resize schedule data to match the configured interval
   */
  resizeScheduleData(intervalMinutes) {
    const pointsNeeded = Math.floor(1440 / intervalMinutes);
    // Only resize if length strictly differs to avoid reset on reload
    if (this.scheduleData.length === pointsNeeded) return;

    Logger.state(`[StateManager] Resizing schedule from ${this.scheduleData.length} to ${pointsNeeded} points (interval: ${intervalMinutes}m)`);

    // Create new array
    const newData = [];
    for (let i = 0; i < pointsNeeded; i++) {
      const minutes = i * intervalMinutes;
      const timeStr = this.minutesToTime(minutes);

      // Interpolate value from existing data
      const val = this.getValueAtTime(timeStr);
      newData.push({
        time: timeStr,
        value: val
      });
    }
    this.scheduleData = newData;
    this.card.hasUnsavedChanges = true;
  }

  /**
   * Robustly set data, normalizing missing time/value fields
   */
  setData(newData) {
    if (!Array.isArray(newData)) {
      Logger.warn('STATE', '[StateManager] setData received non-array data');
      return;
    }

    const interval = this.card.config?.interval_minutes || 60;

    this.scheduleData = newData.map((item, index) => {
      let val, timeStr;

      // Handle legacy number format or simple value
      if (typeof item === 'number' || typeof item === 'string') {
        val = Number(item);
        const minutes = index * interval;
        timeStr = this.minutesToTime(minutes);
      }
      // Handle object format
      else if (typeof item === 'object' && item !== null) {
        val = Number(item.value ?? this.card.config?.min_value ?? 0);

        if (item.time) {
          timeStr = item.time;
        } else {
          // If time missing, try to infer from index (if present) or loop index
          const idx = (typeof item.index === 'number') ? item.index : index;
          const minutes = idx * interval;
          timeStr = this.minutesToTime(minutes);
        }
      } else {
        // Fallback for invalid items
        val = this.card.config?.min_value ?? 0;
        const minutes = index * interval;
        timeStr = this.minutesToTime(minutes);
      }

      return {
        time: timeStr,
        value: val
      };
    });

    Logger.state(`[StateManager] Data updated with ${this.scheduleData.length} points`);
  }

  getData() {
    return this.scheduleData;
  }

  /**
   * Convert time string to minutes since midnight
   * Safe version that handles undefined/null
   */
  timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    const [h, m] = parts.map(Number);
    return h * 60 + m;
  }

  /**
   * Convert minutes to time string
   */
  minutesToTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.round(minutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /**
   * Get value at a specific time (interpolated or nearest)
   * Used during resizing
   */
  getValueAtTime(timeStr) {
    const targetMin = this.timeToMinutes(timeStr);
    // Find closest point
    const closest = this.scheduleData.reduce((prev, curr) => {
      return (Math.abs(this.timeToMinutes(curr.time) - targetMin) < Math.abs(this.timeToMinutes(prev.time) - targetMin) ? curr : prev);
    }, this.scheduleData[0] || { value: 0 });

    return closest.value;
  }

  /**
   * Get current time index (closest point)
   */
  getCurrentIndex() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let closestIndex = 0;
    let minDiff = Infinity;

    this.scheduleData.forEach((point, i) => {
      const diff = Math.abs(this.timeToMinutes(point.time) - currentMinutes);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    });

    return closestIndex;
  }

  /**
   * Get label for a point
   */
  getPointLabel(index) {
    if (index >= 0 && index < this.scheduleData.length) {
      return this.scheduleData[index].time;
    }
    return "??:??";
  }

  /**
   * Insert new point at time
   */
  insertPoint(timeStr, value) {
    const newMinutes = this.timeToMinutes(timeStr);

    // Check if point already exists at this time (approximate check)
    const existingIndex = this.scheduleData.findIndex(p => Math.abs(this.timeToMinutes(p.time) - newMinutes) < 2);
    if (existingIndex !== -1) {
      // Update existing instead of inserting
      this.scheduleData[existingIndex].value = value;
      this.card.hasUnsavedChanges = true;
      Logger.state(`[StateManager] Updated existing point at ${timeStr} = ${value}`);
      return existingIndex;
    }

    // Find insertion position
    let insertIndex = this.scheduleData.findIndex(p =>
      this.timeToMinutes(p.time) > newMinutes
    );

    if (insertIndex === -1) insertIndex = this.scheduleData.length;

    this.scheduleData.splice(insertIndex, 0, { time: timeStr, value });
    this.card.hasUnsavedChanges = true;

    Logger.state(`[StateManager] Inserted point at ${timeStr} = ${value}`);
    return insertIndex;
  }

  /**
   * Remove point at index
   */
  removePoint(index) {
    if (index >= 0 && index < this.scheduleData.length) {
      this.scheduleData.splice(index, 1);
      this.card.hasUnsavedChanges = true;
      Logger.state(`[StateManager] Removed point at index ${index}`);
      return true;
    }
    return false;
  }

  /**
   * Update a single point's value by index
   */
  updatePoint(index, value) {
    if (index < 0 || index >= this.scheduleData.length) return;
    this.scheduleData[index].value = value;
    this.card.hasUnsavedChanges = true;
    this.card.lastEditAt = Date.now();
  }

  /**
   * Align selected points to leftmost or rightmost selected value
   */
  alignSelectedPoints(direction) {
    try {
      const selMgr = this.card.selectionManager;
      const indices = selMgr?.getSelectedPoints?.() || [];
      if (!indices.length) return;

      const sorted = [...indices].sort((a, b) => a - b);
      const anchorIdx = direction === 'right' ? sorted[sorted.length - 1] : sorted[0];
      const anchorValue = this.scheduleData[anchorIdx]?.value;
      if (anchorValue === undefined) return;

      sorted.forEach(i => {
        if (i !== anchorIdx) {
          this.scheduleData[i].value = anchorValue;
        }
      });

      // Update chart to reflect changes
      if (this.card.chartManager?.isInitialized()) {
        this.card.chartManager.updateData(this.scheduleData);
      }

      this.card.hasUnsavedChanges = true;
      this.card.lastEditAt = Date.now();
      Logger.state(`[StateManager] Aligned ${indices.length} points to ${direction} value=${anchorValue}`);
    } catch (e) {
      Logger.warn('STATE', 'alignSelectedPoints failed:', e);
    }
  }
}  