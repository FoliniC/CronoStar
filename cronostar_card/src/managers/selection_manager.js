
/**
 * Selection management for CronoStar Card
 * @module selection-manager
 */

import { Logger, unique } from '../utils.js';

export class SelectionManager {
  constructor(card) {
    this.card = card;
    this.selectedPoint = null;
    this.selectedPoints = [];
    this.selectionSnapshot = null;
  }

  /**
   * Select all points
   */
  selectAll() {
    const allIndices = Array.from({ length: 24 }, (_, i) => i);
    this.selectIndices(allIndices, false);
    this.card.chartManager?.updatePointStyling(this.selectedPoint, this.selectedPoints);
    this.card.chartManager?.update();
  }

  /**
   * Select specific indices
   * @param {Array<number>} indices - Indices to select
   * @param {boolean} preserveAnchor - Whether to preserve anchor point
   */
  selectIndices(indices, preserveAnchor = true) {
    const filtered = unique(indices).filter(i => i >= 0 && i < 24);
    this.selectedPoints = filtered;

    if (preserveAnchor && this.selectedPoint !== null && this.selectedPoints.includes(this.selectedPoint)) {
      // Keep existing anchor
    } else {
      this.selectedPoint = this.selectedPoints.length > 0 ? this.selectedPoints[0] : null;
    }

    this.logSelection("selectIndices");
  }

  /**
   * Toggle index selection
   * @param {number} index - Index to toggle
   */
  toggleIndexSelection(index) {
    const set = new Set(this.selectedPoints);
    
    if (set.has(index)) {
      set.delete(index);
    } else {
      set.add(index);
    }

    this.selectedPoints = Array.from(set);

    if (this.selectedPoint === null || !this.selectedPoints.includes(this.selectedPoint)) {
      this.selectedPoint = this.selectedPoints.length > 0 ? this.selectedPoints[0] : null;
    }

    this.logSelection("toggleIndexSelection");
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selectedPoints = [];
    this.selectedPoint = null;
    Logger.sel("Selection cleared");
  }

  /**
   * Snapshot current selection
   */
  snapshotSelection() {
    if (Array.isArray(this.selectedPoints) && this.selectedPoints.length > 0) {
      this.selectionSnapshot = {
        points: [...this.selectedPoints],
        anchor: this.selectedPoint,
      };
      this.logSelection("snapshot before profile change");
    } else {
      this.selectionSnapshot = null;
      Logger.sel("Snapshot: no active selection");
    }
  }

  /**
   * Restore selection from snapshot
   */
  restoreSelectionFromSnapshot() {
    if (!this.selectionSnapshot) {
      Logger.sel("Restore: no snapshot to restore");
      return;
    }

    const pts = Array.isArray(this.selectionSnapshot.points) 
      ? [...this.selectionSnapshot.points] 
      : [];
    
    this.selectedPoints = pts.filter(i => i >= 0 && i < 24);

    if (this.selectionSnapshot.anchor !== null && pts.includes(this.selectionSnapshot.anchor)) {
      this.selectedPoint = this.selectionSnapshot.anchor;
    } else {
      this.selectedPoint = this.selectedPoints.length > 0 ? this.selectedPoints[0] : null;
    }

    if (this.card.chartManager) {
      this.card.chartManager.updatePointStyling(this.selectedPoint, this.selectedPoints);
    }

    this.logSelection("restore selection after profile change");
  }

  /**
   * Log current selection
   * @param {string} tag - Log tag
   */
  logSelection(tag = '') {
    const anchorLabel = this.selectedPoint !== null 
      ? this.card.stateManager.getHourLabel(this.selectedPoint)
      : 'n/a';
    
    Logger.sel(`${tag} - anchor=${this.selectedPoint} (${anchorLabel}) points=${JSON.stringify(this.selectedPoints)}`);

    if (this.card.stateManager) {
      const scheduleData = this.card.stateManager.scheduleData;
      this.selectedPoints.forEach(i => {
        const label = this.card.stateManager.getHourLabel(i);
        const entityId = this.card.stateManager.getEntityIdForHour(i);
        const chartVal = scheduleData[i];
        const stateObj = this.card.hass?.states?.[entityId];
        const entityState = stateObj ? stateObj.state : undefined;
        
        Logger.sel(`  idx=${i}, hour=${label}, entity=${entityId}, chartVal=${chartVal}, entityState=${entityState}`);
      });
    }
  }

  /**
   * Get selected indices or fallback to anchor
   * @returns {Array<number>}
   */
  getActiveIndices() {
    if (Array.isArray(this.selectedPoints) && this.selectedPoints.length > 0) {
      return [...this.selectedPoints];
    }
    if (this.selectedPoint !== null) {
      return [this.selectedPoint];
    }
    return [];
  }

  /**
   * Check if index is selected
   * @param {number} index - Index to check
   * @returns {boolean}
   */
  isSelected(index) {
    return this.selectedPoints.includes(index);
  }

  /**
   * Check if index is anchor
   * @param {number} index - Index to check
   * @returns {boolean}
   */
  isAnchor(index) {
    return this.selectedPoint === index;
  }

  /**
   * Set anchor point
   * @param {number} index - Index to set as anchor
   */
  setAnchor(index) {
    if (this.selectedPoints.includes(index)) {
      this.selectedPoint = index;
    }
  }

  /**
   * Get anchor point
   * @returns {number|null}
   */
  getAnchor() {
    return this.selectedPoint;
  }

  /**
   * Get selected points
   * @returns {Array<number>}
   */
  getSelectedPoints() {
    return [...this.selectedPoints];
  }
}