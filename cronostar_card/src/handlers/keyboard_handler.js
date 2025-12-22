/** * Keyboard input handling for CronoStar Card * Supports Alt+Q (insert), Alt+W (delete) */
import { Logger, clamp, roundTo } from '../utils.js';

export class KeyboardHandler {
  constructor(card) {
    this.card = card;
    this.ctrlDown = false;
    this.metaDown = false;
    this.shiftDown = false;
    this.altDown = false;
    this.enabled = true;
    this.containerEl = null;

    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleKeyup = this.handleKeyup.bind(this);
    this.handleFocus = this.handleFocus.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this._winKeydown = this._winKeydown.bind(this);
    this._winKeyup = this._winKeyup.bind(this);

    Logger.log('KEYBOARD', '[CronoStar] KeyboardHandler initialized');
  }

  enable() {
    this.enabled = true;
    Logger.log('KEYBOARD', '[CronoStar] Keyboard handling enabled');
  }

  disable() {
    this.enabled = false;
    Logger.log('KEYBOARD', '[CronoStar] Keyboard handling disabled');
  }

  handleFocus(e) {
    Logger.log('KEYBOARD', '[CronoStar] Chart container focused');
    this.enable();
  }

  handleBlur(e) {
    Logger.log('KEYBOARD', '[CronoStar] Chart container blurred');
    this.ctrlDown = false;
    this.metaDown = false;
    this.shiftDown = false;
    this.altDown = false;
  }

  _winKeydown(e) {
    if (!this.enabled) return;
    if (!this.containerEl) return;
    const active = this.card.shadowRoot?.activeElement;
    if (active !== this.containerEl && !(e.ctrlKey || e.metaKey || e.altKey)) return;
    this.handleKeydown(e);
  }

  _winKeyup(e) {
    if (!this.enabled) return;
    if (!this.containerEl) return;
    const active = this.card.shadowRoot?.activeElement;
    if (active !== this.containerEl && !(e.ctrlKey || e.metaKey || e.altKey)) return;
    this.handleKeyup(e);
  }

  focusContainer() {
    try {
      if (this.containerEl && !this.card.isEditorContext()) {
        this.containerEl.focus();
      }
    } catch (e) {
      Logger.warn('KEYBOARD', 'Error focusing container:', e);
    }
  }

  handleKeydown(e) {
    Logger.log('KEYBOARD', `[CronoStar] Keydown: ${e.key}, enabled: ${this.enabled}`);

    // Track modifier keys
    if (e.key === "Control") { this.ctrlDown = true; return; }
    if (e.key === "Meta") { this.metaDown = true; return; }
    if (e.key === "Shift") { this.shiftDown = true; return; }
    if (e.key === "Alt") { this.altDown = true; return; }

    if (!this.enabled) return;

    const isCtrlOrMeta = this.ctrlDown || this.metaDown || e.ctrlKey || e.metaKey;
    const isAlt = this.altDown || e.altKey;

    // Alt+Q: Insert point
    if (isAlt && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      e.stopPropagation();
      this.handleInsertPoint();
      return;
    }

    // Alt+W: Delete point
    if (isAlt && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      e.stopPropagation();
      this.handleDeletePoint();
      return;
    }

    // Ctrl+Enter: Apply now
    if (isCtrlOrMeta && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      Logger.log('KEYBOARD', '[CronoStar] Apply now triggered via Ctrl+Enter');
      this.card.eventHandlers.handleApplyNow();
      this.focusContainer();
      return;
    }

    // Ctrl+A: Select all
    if (isCtrlOrMeta && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      Logger.log('KEYBOARD', '[CronoStar] Select all triggered');
      this.card.selectionManager.selectAll();
      this.card.chartManager?.updatePointStyling(
        this.card.selectionManager.selectedPoint,
        this.card.selectionManager.selectedPoints
      );
      this.card.chartManager?.update();
      this.focusContainer();
      return;
    }

    // Ctrl+S: Save
    if (isCtrlOrMeta && e.key.toLowerCase() === 's') {
      e.preventDefault();
      e.stopPropagation();
      Logger.log('KEYBOARD', '[CronoStar] Save profile triggered via Ctrl+S');
      if (this.card.hasUnsavedChanges && this.card.profileManager.lastLoadedProfile) {
        this.card.profileManager.saveProfile();
      }
      this.focusContainer();
      return;
    }

    // Escape: Clear selection
    if (e.key === "Escape") {
      e.preventDefault();
      this.handleEscape();
      this.focusContainer();
      return;
    }

    const selMgr = this.card.selectionManager;
    const indices = selMgr.getActiveIndices();

    if (indices.length === 0) {
      Logger.log('KEYBOARD', '[CronoStar] No points selected, ignoring arrow keys');
      return;
    }

    // Arrow left/right: Align
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      this.card.isDragging = true;
      this.card.lastEditAt = Date.now();
      this.handleArrowLeftRight(e, indices);
      this.focusContainer();
      return;
    }

    // Arrow up/down: Adjust value
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      this.card.isDragging = true;
      this.card.lastEditAt = Date.now();
      this.handleArrowUpDown(e, indices);
      this.focusContainer();
      return;
    }
  }

  handleKeyup(e) {
    Logger.log('KEYBOARD', `[CronoStar] Keyup: ${e.key}`);

    if (e.key === "Control") {
      this.ctrlDown = false;
    } else if (e.key === "Meta") {
      this.metaDown = false;
    } else if (e.key === "Shift") {
      this.shiftDown = false;
    } else if (e.key === "Alt") {
      this.altDown = false;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown" ||
      e.key === "ArrowLeft" || e.key === "ArrowRight") {
      this.card.isDragging = false;
      this.card.lastEditAt = Date.now();
      this.card.chartManager?.scheduleHideDragValueDisplay(2500);
    }

    this.focusContainer();
  }

  /**
   * Insert point at selected position
   */
  handleInsertPoint() {
    const selMgr = this.card.selectionManager;
    const indices = selMgr.getActiveIndices();

    if (indices.length === 0) {
      Logger.warn('KEYBOARD', 'No point selected for insertion');
      return;
    }

    const anchorIndex = indices[0];
    const scheduleData = this.card.stateManager.scheduleData;

    if (anchorIndex >= scheduleData.length - 1) {
      Logger.warn('KEYBOARD', 'Cannot insert after last point');
      return;
    }

    // Calculate midpoint time
    const currentTime = scheduleData[anchorIndex].time;
    const nextTime = scheduleData[anchorIndex + 1].time;

    const currentMin = this.card.stateManager.timeToMinutes(currentTime);
    const nextMin = this.card.stateManager.timeToMinutes(nextTime);
    const midMin = Math.floor((currentMin + nextMin) / 2);
    const midTime = this.card.stateManager.minutesToTime(midMin);

    // Calculate midpoint value
    const midValue = (scheduleData[anchorIndex].value + scheduleData[anchorIndex + 1].value) / 2;

    // Insert
    const insertedIndex = this.card.stateManager.insertPoint(midTime, midValue);

    // Update chart
    this.card.chartManager.updateData(this.card.stateManager.getData());

    // Select new point
    selMgr.selectIndices([insertedIndex], false);
    this.card.chartManager.updatePointStyling(insertedIndex, [insertedIndex]);

    Logger.log('KEYBOARD', `Inserted point at ${midTime} = ${midValue}`);
  }

  /**
   * Delete selected point
   */
  handleDeletePoint() {
    const selMgr = this.card.selectionManager;
    const indices = selMgr.getActiveIndices();

    if (indices.length === 0) {
      Logger.warn('KEYBOARD', 'No point selected for deletion');
      return;
    }

    const index = indices[0];

    if (this.card.stateManager.removePoint(index)) {
      this.card.chartManager.updateData(this.card.stateManager.getData());
      selMgr.clearSelection();
      Logger.log('KEYBOARD', `Deleted point at index ${index}`);
    }
  }

  handleEscape() {
    const selMgr = this.card.selectionManager;
    selMgr.clearSelection();
    this.card.chartManager?.updatePointStyling(null, []);
    this.card.chartManager?.update();
    Logger.log('KEYBOARD', '[CronoStar] Selection cleared via Escape');
  }

  handleArrowLeftRight(e, indices) {
    // Move selected points horizontally in time, preserving their values
    let minutesStep = Number(this.card.config?.keyboard_time_step_minutes) || 5;

    if (e.altKey) minutesStep = 30;
    else if (e.ctrlKey || e.metaKey) minutesStep = 1;

    const dx = e.key === "ArrowLeft" ? -minutesStep : minutesStep;

    const chartMgr = this.card.chartManager;
    const stateMgr = this.card.stateManager;
    if (!chartMgr?.chart?.data?.datasets?.[0]) return;

    const dataset = chartMgr.chart.data.datasets[0];
    const data = dataset.data;

    // Build time-sorted list to compute non-crossing bounds
    const allByTime = data
      .map((pt, idx) => ({ idx, x: Math.round(Number(pt?.x ?? 0)) }))
      .sort((a, b) => a.x - b.x);
    const selectedSet = new Set(indices);

    // Determine first and last indices by time
    const firstIdx = allByTime[0]?.idx;
    const lastIdx = allByTime[allByTime.length - 1]?.idx;

    // Compute bounds per selected point
    const boundsMap = new Map();
    indices.forEach((selIdx) => {
      const entryPos = allByTime.findIndex((e2) => e2.idx === selIdx);
      let leftBound = 0;
      let rightBound = 1440;

      // Scan left for nearest non-selected neighbor
      for (let k = entryPos - 1; k >= 0; k--) {
        const e2 = allByTime[k];
        if (!selectedSet.has(e2.idx)) { leftBound = e2.x + 1; break; }
      }

      // Scan right for nearest non-selected neighbor
      for (let k = entryPos + 1; k < allByTime.length; k++) {
        const e2 = allByTime[k];
        if (!selectedSet.has(e2.idx)) { rightBound = e2.x - 1; break; }
      }

      boundsMap.set(selIdx, { left: Math.max(0, leftBound), right: Math.min(1440, rightBound) });
    });

    // Apply movement with clamping, do not move first/last points completely
    indices.forEach((i) => {
      const p = data[i];
      if (!p) return;
      if (i === firstIdx || i === lastIdx) return; // keep anchors fixed
      const b = boundsMap.get(i) || { left: 0, right: 1440 };
      let desiredX = Math.round(Number(p.x) + dx);
      desiredX = Math.max(b.left, Math.min(b.right, desiredX));
      desiredX = Math.max(0, Math.min(1440, desiredX));
      p.x = desiredX; // preserve y unchanged
    });

    // Persist to state and update chart
    try {
      const newData = data.map((pt) => ({ x: Number(pt.x), y: Number(pt.y) }));
      stateMgr.setData(newData);
    } catch { }

    chartMgr.updatePointStyling(this.card.selectionManager.selectedPoint, this.card.selectionManager.selectedPoints);
    chartMgr.update('none');
    chartMgr.showDragValueDisplay(indices, data);
  }

  handleArrowUpDown(e, indices) {
    const isSwitch = !!this.card.config?.is_switch_preset;
    const step = isSwitch ? 1 : this.card.config.step_value;
    const delta = e.key === "ArrowUp" ? step : -step;

    const selMgr = this.card.selectionManager;
    const stateMgr = this.card.stateManager;
    const chartMgr = this.card.chartManager;

    if (!chartMgr?.chart?.data?.datasets?.[0]) {
      Logger.warn('KEYBOARD', '[CronoStar] Chart not ready');
      return;
    }

    const upperClamp = this.card.config.allow_max_value && !this.card.config.is_switch_preset
      ? this.card.config.max_value + this.card.config.step_value
      : this.card.config.max_value;

    const dataset = chartMgr.chart.data.datasets[0];

    indices.forEach(i => {
      const current = dataset.data[i];
      const currentVal = (typeof current === 'object' && current !== null) ? Number(current.y) : Number(current);
      let val = currentVal + delta;
      if (isSwitch) {
        // Preserve ON by only changing on ArrowDown; ArrowUp sets to ON
        val = e.key === 'ArrowUp' ? 1 : 0;
      } else {
        val = clamp(val, this.card.config.min_value, upperClamp);
        val = roundTo(val, 1);
      }

      if (typeof dataset.data[i] === 'object' && dataset.data[i] !== null) {
        dataset.data[i].y = val;
      } else {
        dataset.data[i] = val;
      }

      stateMgr.updatePoint(i, val);
    });

    if (this.card.selectedProfile) {
      this.card.profileManager.saveProfile(this.card.selectedProfile)
        .catch(e => Logger.error('KEYBOARD', 'Save failed:', e));
    } else {
      this.card.hasUnsavedChanges = true;
    }

    chartMgr.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
    chartMgr.update('none');
    chartMgr.showDragValueDisplay(indices, dataset.data);
  }

  attachListeners(element) {
    if (!element) {
      Logger.error('KEYBOARD', '[CronoStar] Cannot attach listeners: element is null');
      return;
    }

    this.detachListeners(element);
    this.containerEl = element;

    element.addEventListener('keydown', this.handleKeydown);
    element.addEventListener('keyup', this.handleKeyup);
    element.addEventListener('focus', this.handleFocus);
    element.addEventListener('blur', this.handleBlur);

    window.addEventListener('keydown', this._winKeydown, true);
    window.addEventListener('keyup', this._winKeyup, true);

    Logger.log('KEYBOARD', '[CronoStar] Keyboard listeners attached');
  }

  detachListeners(element) {
    if (element) {
      element.removeEventListener('keydown', this.handleKeydown);
      element.removeEventListener('keyup', this.handleKeyup);
      element.removeEventListener('focus', this.handleFocus);
      element.removeEventListener('blur', this.handleBlur);
    }

    window.removeEventListener('keydown', this._winKeydown, true);
    window.removeEventListener('keyup', this._winKeyup, true);

    Logger.log('KEYBOARD', '[CronoStar] Keyboard listeners detached');
  }
}  