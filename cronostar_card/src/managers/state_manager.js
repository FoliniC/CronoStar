import { Logger } from '../utils.js';

export class StateManager {
  constructor(card) {
    this.card = card;
    // Sparse schedule: array of {time: "HH:MM", value: number}
    this.scheduleData = [];
    this.isLoadingProfile = false;

    this._initializeScheduleData();
  }

  /**
   * Initialize schedule for sparse mode: start with boundary points.
   */
  _initializeScheduleData() {
    const defaultVal = this.card.config?.min_value ?? 0;
    this.scheduleData = [
      { time: "00:00", value: defaultVal },
      { time: "23:59", value: defaultVal }
    ];
    Logger.state(`[StateManager] Initialized (sparse) with ${this.scheduleData.length} points`);
  }

  /**
   * Get current number of points (sparse schedule)
   */
  getNumPoints() {
    return this.scheduleData.length;
  }

  // Sparse mode: no interval-based resizing

  /**
   * Robustly set data, normalizing missing time/value fields
   */
  setData(newData) {
    if (!Array.isArray(newData)) {
      Logger.warn('STATE', '[StateManager] setData received non-array data');
      return;
    }

    // Sparse mode: accept only object items with {time,value} or {x,y}
    this.scheduleData = newData
      .map((item) => {
        if (typeof item !== 'object' || item === null) return null;
        let timeStr;
        let val;

        if (typeof item.time === 'string' && item.value !== undefined) {
          timeStr = String(item.time);
          val = Number(item.value);
        } else if (item.x !== undefined && item.y !== undefined) {
          timeStr = this.minutesToTime(Number(item.x));
          val = Number(item.y);
        } else {
          return null;
        }

        if (!/^\d{2}:\d{2}$/.test(timeStr)) return null;
        if (!Number.isFinite(val)) val = 0;
        return { time: timeStr, value: val };
      })
      .filter((p) => p !== null);

    // Ensure at least boundary points exist
    if (this.scheduleData.length === 0) {
      const defaultVal = this.card.config?.min_value ?? 0;
      this.scheduleData = [
        { time: "00:00", value: defaultVal },
        { time: "23:59", value: defaultVal }
      ];
    }

    this.card.hasUnsavedChanges = true;
    Logger.state(`[StateManager] setData (sparse) accepted ${this.scheduleData.length} points`);
  }

  /**
   * Return copy of schedule data
   */
  getData() {
    return [...this.scheduleData];
  }

  /**
   * Insert point (used by pointer/keyboard handlers)
   */
  insertPoint(timeStr, value) {
    const newMinutes = this.timeToMinutes(timeStr);

    // Try to update existing point within small tolerance
    const existingIndex = this.scheduleData.findIndex(p => Math.abs(this.timeToMinutes(p.time) - newMinutes) < 2);
    if (existingIndex !== -1) {
      this.scheduleData[existingIndex].value = value;
      this.card.hasUnsavedChanges = true;
      Logger.state(`[StateManager] Updated existing point at ${timeStr} = ${value}`);
      return existingIndex;
    }

    // Find insertion position
    let insertIndex = this.scheduleData.findIndex(p => this.timeToMinutes(p.time) > newMinutes);
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
      let indices = selMgr?.getSelectedPoints?.() || [];
      if (!Array.isArray(indices) || indices.length === 0) return;

      // Keep indices within bounds to avoid "undefined.value" errors
      indices = indices
        .map((i) => Number(i))
        .filter((i) => Number.isInteger(i) && i >= 0 && i < this.scheduleData.length);

      if (!indices.length) return;

      const sorted = [...indices].sort((a, b) => a - b);
      const anchorIdx = direction === 'right' ? sorted[sorted.length - 1] : sorted[0];

      const anchorValue = this.scheduleData[anchorIdx]?.value;
      if (anchorValue === undefined) return;

      sorted.forEach((i) => {
        if (i !== anchorIdx && this.scheduleData[i]) {
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

  /**
   * Utility: convert minutes to HH:MM
   */
  minutesToTime(minutes) {
    let m = Math.round(minutes);
    while (m < 0) m += 1440;
    while (m >= 1440) m -= 1440;
    const h = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /**
   * Utility: convert HH:MM to total minutes
   */
  timeToMinutes(timeStr) {
    const [hh, mm] = String(timeStr || '00:00').split(':').map((s) => Number(s));
    const h = Number.isFinite(hh) ? hh : 0;
    const m = Number.isFinite(mm) ? mm : 0;
    return (h % 24) * 60 + (m % 60);
  }

  /**
   * Get value at a given time, using nearest or previous point
   */
  getValueAtTime(timeStr) {
    const target = this.timeToMinutes(timeStr);
    let bestIdx = -1;
    let bestDelta = Infinity;

    for (let i = 0; i < this.scheduleData.length; i++) {
      const d = Math.abs(this.timeToMinutes(this.scheduleData[i].time) - target);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) return this.scheduleData[bestIdx].value;
    return this.card.config?.min_value ?? 0;
  }

  /**
   * Current index based on local time and interval
   */
  getCurrentIndex() {
    // Sparse: find nearest point to current time
    const now = new Date();
    const target = now.getHours() * 60 + now.getMinutes();
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < this.scheduleData.length; i++) {
      const d = Math.abs(this.timeToMinutes(this.scheduleData[i].time) - target);
      if (d < bestDelta) {
        bestDelta = d;
        bestIdx = i;
      }
    }
    return bestIdx === -1 ? 0 : bestIdx;
  }

  /**
   * Get label for a point (HH:MM)
   */
  getPointLabel(index) {
    const p = this.scheduleData[index];
    return p?.time || '00:00';
  }
}