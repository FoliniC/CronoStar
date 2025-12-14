/**
 * Keyboard input handling for CronoStar Card
 * @module keyboard-handler
 */

import { Logger, clamp, roundTo } from '../utils.js';

export class KeyboardHandler {
  constructor(card) {
    this.card = card;
    this.ctrlDown = false;
    this.metaDown = false;
    this.shiftDown = false;
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
  }

  _winKeydown(e) {
    if (!this.enabled) return;
    if (!this.containerEl) return;
    const active = this.card.shadowRoot?.activeElement;
    if (active !== this.containerEl && !(e.ctrlKey || e.metaKey)) return;
    this.handleKeydown(e);
  }

  _winKeyup(e) {
    if (!this.enabled) return;
    if (!this.containerEl) return;
    const active = this.card.shadowRoot?.activeElement;
    if (active !== this.containerEl && !(e.ctrlKey || e.metaKey)) return;
    this.handleKeyup(e);
  }

  focusContainer() {
    try {
      this.containerEl?.focus();
    } catch (e) { Logger.warn('KEYBOARD', 'Error focusing container:', e); }
  }

  handleKeydown(e) {
    Logger.log('KEYBOARD', `[CronoStar] Keydown: ${e.key}, enabled: ${this.enabled}`);

    if (e.key === "Control") {
      this.ctrlDown = true;
      Logger.log('KEYBOARD', '[CronoStar] Ctrl pressed');
      return;
    }
    if (e.key === "Meta") {
      this.metaDown = true;
      Logger.log('KEYBOARD', '[CronoStar] Meta pressed');
      return;
    }
    if (e.key === "Shift") {
      this.shiftDown = true;
      Logger.log('KEYBOARD', '[CronoStar] Shift pressed');
      return;
    }

    if (!this.enabled) {
      Logger.log('KEYBOARD', '[CronoStar] Keyboard handling disabled, ignoring key');
      return;
    }

    const isCtrlOrMeta = this.ctrlDown || this.metaDown || e.ctrlKey || e.metaKey;

    if (isCtrlOrMeta && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      Logger.log('KEYBOARD', '[CronoStar] Apply now triggered via Ctrl+Enter');
      this.card.handleApplyNow();
      this.focusContainer();
      return;
    }

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

    if (e.key === "Escape") {
      e.preventDefault();
      Logger.log('KEYBOARD', '[CronoStar] Escape pressed - clearing selection');
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

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      Logger.log('KEYBOARD', `[CronoStar] ${e.key} pressed with ${indices.length} points selected`);
      this.card.isDragging = true;
      this.card.lastEditAt = Date.now();
      this.card.awaitingAutomation = false;
      this.card.outOfSyncDetails = "";
      this.card.cardSync.scheduleAutomationOverlaySuppression();
      this.handleArrowLeftRight(e, indices);
      this.focusContainer();
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      Logger.log('KEYBOARD', `[CronoStar] ${e.key} pressed with ${indices.length} points selected`);
      this.card.isDragging = true;
      this.card.lastEditAt = Date.now();
      this.card.awaitingAutomation = false;
      this.card.outOfSyncDetails = "";
      this.card.cardSync.scheduleAutomationOverlaySuppression();
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
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown" ||
        e.key === "ArrowLeft" || e.key === "ArrowRight") {
      this.card.isDragging = false;
      this.card.lastEditAt = Date.now();
      this.card.chartManager?.scheduleHideDragValueDisplay(2500);
      this.card.cardSync.scheduleAutomationOverlaySuppression();
      try {
        this.card.cardSync.updateAutomationSync(this.card._hass);
      } catch (e) { Logger.warn('KEYBOARD', 'Error updating automation sync on keyup:', e); }
    }

    this.focusContainer();
  }

  handleEscape() {
    const selMgr = this.card.selectionManager;
    selMgr.clearSelection();
    this.card.chartManager?.updatePointStyling(null, []);
    this.card.chartManager?.update();
    Logger.log('KEYBOARD', '[CronoStar] Selection cleared via Escape');
  }

  handleArrowLeftRight(e, indices) {
    const stateMgr = this.card.stateManager;
    const chartMgr = this.card.chartManager;

    if (!chartMgr?.chart?.data?.datasets?.[0]) {
      Logger.warn('KEYBOARD', '[CronoStar] Chart not ready for arrow key handling');
      return;
    }

    const dataset = chartMgr.chart.data.datasets[0];

    let targetIndex;
    if (e.key === "ArrowLeft") {
      targetIndex = Math.min(...indices);
    } else {
      targetIndex = Math.max(...indices);
    }

    const targetVal = dataset.data[targetIndex] ?? stateMgr.scheduleData[targetIndex];
    const rounded = roundTo(targetVal, 1);

    Logger.key(
      `[CronoStar] ${e.key} -> align to index: ${targetIndex} ` +
      `(${stateMgr.getHourLabel(targetIndex)}) value=${rounded} ` +
      `indices=${JSON.stringify(indices)}`
    );

    const newData = [...stateMgr.scheduleData];
    indices.forEach(i => {
      newData[i] = rounded;
      dataset.data[i] = rounded;
      stateMgr.updateTemperatureAtHour(i, rounded);
    });

    this.card.hasUnsavedChanges = true;
    stateMgr.setData(newData);
    chartMgr.updatePointStyling(
      this.card.selectionManager.selectedPoint,
      this.card.selectionManager.selectedPoints
    );
    chartMgr.update();
    chartMgr.showDragValueDisplay(indices, dataset.data);
  }

  handleArrowUpDown(e, indices) {
    const delta = e.key === "ArrowUp"
      ? this.card.config.step_value
      : -this.card.config.step_value;

    const selMgr = this.card.selectionManager;
    const stateMgr = this.card.stateManager;
    const chartMgr = this.card.chartManager;

    if (!chartMgr?.chart?.data?.datasets?.[0]) {
      Logger.warn('KEYBOARD', '[CronoStar] Chart not ready for arrow key handling');
      return;
    }

    const upperClamp = this.card.config.allow_max_value && !this.card.config.is_switch_preset
      ? this.card.config.max_value + this.card.config.step_value
      : this.card.config.max_value;
    const dataset = chartMgr.chart.data.datasets[0];
    const newData = [...stateMgr.scheduleData];

    Logger.key(`[CronoStar] ${e.key} -> delta=${delta} indices=${JSON.stringify(indices)}`);

    indices.forEach(i => {
      let val = (dataset.data[i] ?? stateMgr.scheduleData[i]) + delta;
      val = clamp(val, this.card.config.min_value, upperClamp);
      val = roundTo(val, 1);
      dataset.data[i] = val;
      newData[i] = val;
      stateMgr.updateTemperatureAtHour(i, val);
    });

    this.card.hasUnsavedChanges = true;
    stateMgr.setData(newData);
    chartMgr.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
    chartMgr.update();
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

    Logger.log('KEYBOARD', '[CronoStar] Keyboard listeners attached to element and window');
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

    Logger.log('KEYBOARD', '[CronoStar] Keyboard listeners detached from element');
  }
}  