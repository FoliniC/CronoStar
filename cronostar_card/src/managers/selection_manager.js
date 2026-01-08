// cronostar_card/src/managers/SelectionManager.js
/**
 * Selection management for chart points
 * Handles single and multi-point selection with history
 */

import { Logger } from '../utils.js';
import { Events } from '../core/EventBus.js';

export class SelectionManager {
  constructor(context) {
    this.context = context;
    this._selectedPoints = new Set();
    this._anchorPoint = null;
    this._snapshot = null;

    this._setupEventListeners();
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    // Clear selection when schedule changes
    this.context.events.on(Events.SCHEDULE_UPDATED, () => {
      this._validateSelection();
    });
  }

  /**
   * Validate selection after schedule change
   * @private
   */
  _validateSelection() {
    const stateManager = this.context.getManager('state');
    if (!stateManager) return;

    const maxIndex = stateManager.getNumPoints() - 1;
    const toRemove = [];

    this._selectedPoints.forEach(index => {
      if (index > maxIndex) {
        toRemove.push(index);
      }
    });

    toRemove.forEach(index => this._selectedPoints.delete(index));

    if (this._anchorPoint !== null && this._anchorPoint > maxIndex) {
      this._anchorPoint = null;
    }
  }

  /**
   * Select a single point
   * @param {number} index - Point index
   */
  selectPoint(index) {
    this._selectedPoints.clear();
    this._selectedPoints.add(index);
    this._anchorPoint = index;

    this._emitChange();
    this.logSelection('selectPoint');
  }

  /**
   * Toggle point selection
   * @param {number} index - Point index
   */
  togglePoint(index) {
    if (this._selectedPoints.has(index)) {
      this._selectedPoints.delete(index);
      if (this._anchorPoint === index) {
        this._anchorPoint = this._selectedPoints.size > 0
          ? Array.from(this._selectedPoints)[0]
          : null;
      }
    } else {
      this._selectedPoints.add(index);
      this._anchorPoint = index;
    }

    this._emitChange();
    this.logSelection('togglePoint');
  }

  /**
   * Select range from anchor to index
   * @param {number} endIndex - End index
   */
  selectRange(endIndex) {
    if (this._anchorPoint === null) {
      this.selectPoint(endIndex);
      return;
    }

    const start = Math.min(this._anchorPoint, endIndex);
    const end = Math.max(this._anchorPoint, endIndex);

    this._selectedPoints.clear();
    for (let i = start; i <= end; i++) {
      this._selectedPoints.add(i);
    }

    this._emitChange();
    this.logSelection('selectRange');
  }

  /**
   * Select multiple indices
   * @param {Array<number>} indices - Point indices
   * @param {boolean} preserveAnchor - Keep current anchor
   */
  selectIndices(indices, preserveAnchor = false) {
    this._selectedPoints.clear();

    const validIndices = indices.filter(i =>
      Number.isInteger(i) && i >= 0
    );

    validIndices.forEach(i => this._selectedPoints.add(i));

    if (!preserveAnchor || !this._selectedPoints.has(this._anchorPoint)) {
      this._anchorPoint = validIndices[0] ?? null;
    }

    this._emitChange();
    this.logSelection('selectIndices');
  }

  /**
   * Select all points
   */
  selectAll() {
    const stateManager = this.context.getManager('state');
    if (!stateManager) return;

    const count = stateManager.getNumPoints();
    this._selectedPoints.clear();

    for (let i = 0; i < count; i++) {
      this._selectedPoints.add(i);
    }

    this._anchorPoint = 0;

    this._emitChange();
    this.logSelection('selectAll');
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this._selectedPoints.clear();
    this._anchorPoint = null;

    this._emitChange();
    Logger.sel('Selection cleared');
  }

  /**
   * Get selected points
   * @returns {Array<number>} Selected indices
   */
  getSelectedPoints() {
    return Array.from(this._selectedPoints);
  }

  /**
   * Get active indices (selected or anchor)
   * @returns {Array<number>}
   */
  getActiveIndices() {
    if (this._selectedPoints.size > 0) {
      return this.getSelectedPoints();
    }
    if (this._anchorPoint !== null) {
      return [this._anchorPoint];
    }
    return [];
  }

  /**
   * Check if index is selected
   * @param {number} index - Point index
   * @returns {boolean}
   */
  isSelected(index) {
    return this._selectedPoints.has(index);
  }

  /**
   * Check if index is anchor
   * @param {number} index - Point index
   * @returns {boolean}
   */
  isAnchor(index) {
    return this._anchorPoint === index;
  }

  /**
   * Get anchor point
   * @returns {number|null}
   */
  getAnchor() {
    return this._anchorPoint;
  }

  /**
   * Set anchor point
   * @param {number} index - Point index
   */
  setAnchor(index) {
    if (this._selectedPoints.has(index)) {
      this._anchorPoint = index;
      this._emitChange();
    }
  }

  /**
   * Snapshot current selection
   */
  snapshotSelection() {
    if (this._selectedPoints.size > 0) {
      this._snapshot = {
        points: this.getSelectedPoints(),
        anchor: this._anchorPoint
      };
      this.logSelection('snapshot');
    } else {
      this._snapshot = null;
      Logger.sel('Snapshot: no active selection');
    }
  }

  /**
   * Restore selection from snapshot
   */
  restoreSelection() {
    if (!this._snapshot) {
      Logger.sel('Restore: no snapshot available');
      return;
    }

    this.selectIndices(this._snapshot.points, false);

    if (this._snapshot.anchor !== null &&
        this._selectedPoints.has(this._snapshot.anchor)) {
      this._anchorPoint = this._snapshot.anchor;
    }

    this._emitChange();
    this.logSelection('restore');
  }

  /**
   * Emit selection change event
   * @private
   */
  _emitChange() {
    this.context.events.emit(Events.SELECTION_CHANGED, {
      selected: this.getSelectedPoints(),
      anchor: this._anchorPoint
    });
  }

  /**
   * Log selection state
   * @param {string} tag - Action tag
   */
  logSelection(tag) {
    const stateManager = this.context.getManager('state');
    const anchorLabel = this._anchorPoint !== null && stateManager
      ? stateManager.getPointLabel(this._anchorPoint)
      : 'n/a';

    Logger.sel(
      `${tag} - anchor=${this._anchorPoint} (${anchorLabel}) ` +
      `points=[${Array.from(this._selectedPoints).join(',')}]`
    );
  }

  /**
   * Get current anchor point index
   * @returns {number|null}
   */
  get selectedPoint() {
    return this._anchorPoint;
  }

  /**
   * Get current selected point indices
   * @returns {Array<number>}
   */
  get selectedPoints() {
    return this.getSelectedPoints();
  }

  /**
   * Handle pointer down event (delegated from CardRenderer)
   * @param {PointerEvent} e
   */
  handlePointerDown(e) {
    if (this.context._card.pointerHandler) {
      this.context._card.pointerHandler.onPointerDown(e);
    }
  }

  /**
   * Handle pointer move event (delegated from CardRenderer)
   * @param {PointerEvent} e
   */
  handlePointerMove(e) {
    if (this.context._card.pointerHandler) {
      this.context._card.pointerHandler.onPointerMove(e);
    }
  }

  /**
   * Handle pointer up event (delegated from CardRenderer)
   * @param {PointerEvent} e
   */
  handlePointerUp(e) {
    if (this.context._card.pointerHandler) {
      this.context._card.pointerHandler.onPointerUp(e);
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    this._selectedPoints.clear();
    this._anchorPoint = null;
    this._snapshot = null;
  }
}