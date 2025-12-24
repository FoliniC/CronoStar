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
   * Select a single point (alias for compatibility with ChartManager)
   * @param {number} index - Index to select
   */
  selectPoint(index) {
    this.selectIndices([index], false);

    // Ensure update is triggered safely
    if (this.card.chartManager && typeof this.card.chartManager.updatePointStyling === 'function') {
      this.card.chartManager.updatePointStyling(this.selectedPoint, this.selectedPoints);
      if (this.card.chartManager.isInitialized()) {
        this.card.chartManager.getChart()?.update('none'); // Use 'none' to avoid animation glitches
      }
    }

    this.card.requestUpdate();
  }

  /**
   * Toggle a point (alias for compatibility with ChartManager)
   * @param {number} index - Index to toggle
   */
  togglePoint(index) {
    this.toggleIndexSelection(index);

    if (this.card.chartManager && typeof this.card.chartManager.updatePointStyling === 'function') {
      this.card.chartManager.updatePointStyling(this.selectedPoint, this.selectedPoints);
      if (this.card.chartManager.isInitialized()) {
        this.card.chartManager.getChart()?.update('none');
      }
    }

    this.card.requestUpdate();
  }

  /**
   * Select a range of points (required by ChartManager)
   * @param {number} endIndex - End index of the range
   */
  selectRange(endIndex) {
    if (this.selectedPoints.length === 0) {
      this.selectPoint(endIndex);
      return;
    }

    const start = Math.min(...this.selectedPoints);
    const rangeStart = Math.min(start, endIndex);
    const rangeEnd = Math.max(start, endIndex);

    const indices = [];
    for (let i = rangeStart; i <= rangeEnd; i++) indices.push(i);

    this.selectIndices(indices, false);

    if (this.card.chartManager && typeof this.card.chartManager.updatePointStyling === 'function') {
      this.card.chartManager.updatePointStyling(this.selectedPoint, this.selectedPoints);
      if (this.card.chartManager.isInitialized()) {
        this.card.chartManager.getChart()?.update('none');
      }
    }

    this.card.requestUpdate();
  }

  /**
   * Select all points
   */
  selectAll() {
    const count = this.card?.stateManager?.getNumPoints?.() || 24;
    const allIndices = Array.from({ length: count }, (_, i) => i);
    this.selectIndices(allIndices, false);

    if (this.card.chartManager && typeof this.card.chartManager.updatePointStyling === 'function') {
      this.card.chartManager.updatePointStyling(this.selectedPoint, this.selectedPoints);
      if (this.card.chartManager.isInitialized()) {
        this.card.chartManager.getChart()?.update('none');
      }
    }
  }

  /**
   * Select exact indices
   * @param {number[]} indices
   * @param {boolean} preserveAnchor - whether to keep current anchor if still valid
   */
  selectIndices(indices, preserveAnchor = true) {
    const total = this.card?.stateManager?.getNumPoints?.() || 24;
    const filtered = unique(Array.isArray(indices) ? indices : [])
      .map((i) => Number(i))
      .filter((i) => Number.isInteger(i) && i >= 0 && i < total);

    this.selectedPoints = filtered;

    if (preserveAnchor && this.selectedPoint !== null && this.selectedPoints.includes(this.selectedPoint)) {
      // Keep existing anchor
    } else {
      this.selectedPoint = this.selectedPoints.length > 0 ? this.selectedPoints[0] : null;
    }

    // Sync with card property for reactivity
    this.card.selectedPoints = [...this.selectedPoints];

    this.logSelection('selectIndices');
  }

  /**
   * Toggle index selection
   * @param {number} index - Index to toggle
   */
  toggleIndexSelection(index) {
    const total = this.card?.stateManager?.getNumPoints?.() || 24;
    if (!Number.isInteger(index) || index < 0 || index >= total) return;

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

    // Sync with card property
    this.card.selectedPoints = [...this.selectedPoints];

    this.logSelection('toggleIndexSelection');
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selectedPoints = [];
    this.selectedPoint = null;
    this.selectionSnapshot = null;
    this.card.selectedPoints = []; // Sync
    Logger.sel('Selection cleared');
  }

  /**
   * Snapshot current selection
   */
  snapshotSelection() {
    const pts = Array.isArray(this.selectedPoints) ? [...this.selectedPoints] : [];
    if (pts.length > 0) {
      this.selectionSnapshot = {
        points: [...pts],
        anchor: this.selectedPoint
      };
      this.logSelection('snapshot before profile change');
    } else {
      this.selectionSnapshot = null;
      Logger.sel('Snapshot: no active selection');
    }
  }

  /**
   * Restore selection from snapshot
   */
  restoreSelectionFromSnapshot() {
    if (!this.selectionSnapshot) {
      Logger.sel('Restore: no snapshot to restore');
      return;
    }

    const total = this.card?.stateManager?.getNumPoints?.() || 24;

    const pts = Array.isArray(this.selectionSnapshot.points)
      ? [...this.selectionSnapshot.points]
      : [];

    this.selectedPoints = pts
      .map((i) => Number(i))
      .filter((i) => Number.isInteger(i) && i >= 0 && i < total);

    if (
      this.selectionSnapshot.anchor !== null &&
      this.selectedPoints.includes(this.selectionSnapshot.anchor)
    ) {
      this.selectedPoint = this.selectionSnapshot.anchor;
    } else {
      this.selectedPoint = this.selectedPoints.length > 0 ? this.selectedPoints[0] : null;
    }

    this.card.selectedPoints = [...this.selectedPoints]; // Sync

    if (this.card.chartManager && typeof this.card.chartManager.updatePointStyling === 'function') {
      this.card.chartManager.updatePointStyling(this.selectedPoint, this.selectedPoints);
    }

    this.logSelection('restore selection after profile change');
  }

  /**
   * Log current selection
   * @param {string} tag - Log tag
   */
  logSelection(tag = '') {
    const anchorLabel =
      this.selectedPoint !== null && this.card.stateManager
        ? this.card.stateManager.getPointLabel(this.selectedPoint)
        : 'n/a';

    Logger.sel(`${tag} - anchor=${this.selectedPoint} (${anchorLabel}) points=${JSON.stringify(this.selectedPoints)}`);
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
