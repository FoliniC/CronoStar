import { Logger, safeParseFloat, formatHourString } from '../utils.js';

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
   * Convert time string to minutes since midnight
   */
  timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
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
    if (this.scheduleData.length <= 2) {
      Logger.warn('STATE', 'Cannot remove - minimum 2 points required');
      return false;
    }
    
    if (index >= 0 && index < this.scheduleData.length) {
      const removed = this.scheduleData.splice(index, 1);
      this.card.hasUnsavedChanges = true;
      Logger.state(`[StateManager] Removed point at ${removed[0].time}`);
      return true;
    }
    
    return false;
  }

  /**
   * Update value for specific point
   */
  updatePoint(index, value) {
    if (index >= 0 && index < this.scheduleData.length) {
      this.scheduleData[index].value = value;
      this.card.hasUnsavedChanges = true;
      Logger.state(`[StateManager] Updated point ${index} to ${value}`);
    }
  }

  /**
   * Get value at specific time (interpolated if needed)
   */
  getValueAtTime(timeStr) {
    const targetMinutes = this.timeToMinutes(timeStr);
    
    // Find surrounding points
    let before = null, after = null;
    let beforeMinutes = -1, afterMinutes = -1;
    
    for (let i = 0; i < this.scheduleData.length; i++) {
      const pointMinutes = this.timeToMinutes(this.scheduleData[i].time);
      
      if (pointMinutes <= targetMinutes) {
        if (!before || pointMinutes > beforeMinutes) {
             before = this.scheduleData[i];
             beforeMinutes = pointMinutes;
        }
      }
      if (pointMinutes >= targetMinutes) {
         if (!after || pointMinutes < afterMinutes) {
             after = this.scheduleData[i];
             afterMinutes = pointMinutes;
         }
      }
    }
    
    // Handle edge cases
    if (!before) {
        before = this.scheduleData[this.scheduleData.length - 1];
        beforeMinutes = this.timeToMinutes(before.time) - 1440; // Treat as previous day
    }
    if (!after) {
        after = this.scheduleData[0];
        afterMinutes = this.timeToMinutes(after.time) + 1440; // Treat as next day
    }
    
    // Exact match
    if (before.time === timeStr) return before.value;
    if (after.time === timeStr) return after.value;
    
    const beforeVal = before.value;
    const afterVal = after.value;
    
    if (beforeMinutes === afterMinutes) return beforeVal;
    
    const ratio = (targetMinutes - beforeMinutes) / (afterMinutes - beforeMinutes);
    return beforeVal + ratio * (afterVal - beforeVal);
  }

  /**
   * Optimize schedule: remove redundant points
   */
  optimizeSchedule() {
    if (this.scheduleData.length <= 2) return;
    
    const optimized = [this.scheduleData[0]]; // Always keep first
    
    for (let i = 1; i < this.scheduleData.length - 1; i++) {
      const prev = this.scheduleData[i - 1];
      const curr = this.scheduleData[i];
      const next = this.scheduleData[i + 1];
      
      // Keep if value changes
      if (Math.abs(curr.value - prev.value) > 0.01 || 
          Math.abs(curr.value - next.value) > 0.01) {
        optimized.push(curr);
      }
    }
    
    optimized.push(this.scheduleData[this.scheduleData.length - 1]); // Always keep last
    
    const removed = this.scheduleData.length - optimized.length;
    if (removed > 0) {
      this.scheduleData = optimized;
      Logger.state(`[StateManager] Optimized: removed ${removed} redundant points`);
    }
  }

  /**
   * Get schedule data
   */
  getData() {
    return this.scheduleData.map(p => p.value);
  }

  /**
   * Set schedule data
   */
  setData(data) {
    if (Array.isArray(data)) {
      if (data.length === 0) return;

      if (typeof data[0] === 'object' && 'time' in data[0]) {
        // Already in correct format
        this.scheduleData = data.map(p => ({
          time: p.time,
          value: Number(p.value)
        }));
      } else {
        // Convert from simple array (legacy/backend format)
        // Dynamically determine interval based on data length to cover 24h
        const count = data.length;
        const interval = 1440 / count;
        
        this.scheduleData = data.map((val, i) => {
           const minutes = Math.round(i * interval);
           return {
             time: this.minutesToTime(minutes),
             value: Number(val)
           };
        });
      }
    }
  }

  /**
   * Align selected points (left/right)
   */
  alignSelectedPoints(direction) {
    const selMgr = this.card.selectionManager;
    const indices = selMgr.getActiveIndices();
    
    if (indices.length === 0) return;
    
    const targetIndex = direction === 'left' 
      ? Math.min(...indices) 
      : Math.max(...indices);
    
    const targetValue = this.scheduleData[targetIndex].value;
    
    indices.forEach(i => {
      this.scheduleData[i].value = targetValue;
    });
    
    this.card.hasUnsavedChanges = true;
    this.card.chartManager?.update();
    
    if (this.card.selectedProfile) {
      this.card.profileManager.saveProfile(this.card.selectedProfile)
        .catch(e => Logger.error('ALIGN', 'Save failed:', e));
    }
  }
}
