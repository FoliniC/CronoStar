/** * Keyboard input handling for CronoStar Card * Supports Alt+Q (insert), Alt+W (delete) */
import { Logger, clamp, roundTo, timeToMinutes, minutesToTime } from '../utils.js';

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

    // Undo / Redo
    if (isCtrlOrMeta && !isAlt) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        if (this.card.stateManager?.undo()) {
          Logger.log('KEYBOARD', '[CronoStar] Undo performed');
        }
        return;
      }
      if (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        e.stopPropagation();
        if (this.card.stateManager?.redo()) {
          Logger.log('KEYBOARD', '[CronoStar] Redo performed');
        }
        return;
      }
    }

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
      this.focusContainer();
      return;
    }

    // Escape: Clear selection or close context menu
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.card.contextMenu?.show) {
        this.card.contextMenu = { ...this.card.contextMenu, show: false };
        this.card.requestUpdate();
      } else {
        this.handleEscape();
      }
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

    const currentMin = timeToMinutes(currentTime);
    const nextMin = timeToMinutes(nextTime);
    const midMin = Math.floor((currentMin + nextMin) / 2);
    const midTime = minutesToTime(midMin);

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
    const chartMgr = this.card.chartManager;
    const stateMgr = this.card.stateManager;
    if (!chartMgr?.chart?.data?.datasets?.[0]) return;

    const dataset = chartMgr.chart.data.datasets[0];
    const data = dataset.data;
    
    // Alt + Left/Right Arrow: Align Functionality
    if (e.altKey) {
      if (indices.length < 2) return; // Need multiple points to align
      
      const selectedX = indices.map(i => data[i]?.x).filter(x => x !== undefined);
      if (selectedX.length === 0) return;

      // Align Left (Min X) or Right (Max X)
      const targetX = e.key === "ArrowLeft" ? Math.min(...selectedX) : Math.max(...selectedX);
      
      indices.forEach(i => {
         if (i === 0 || i === data.length - 1) return; // Skip anchors
         const p = data[i];
         if (p) p.x = targetX;
      });
      
    } else {
        // Standard Movement
        let minutesStep = 1; // Default 1 min
        if (e.shiftKey) minutesStep = 30; // 30 min with Shift
        else if (e.ctrlKey || e.metaKey) minutesStep = 5; 
        
        let snapToGrid = e.shiftKey;
        const dx = e.key === "ArrowLeft" ? -minutesStep : minutesStep;

        // 1. Build a time-sorted list of ALL points to find true neighbors
        const allByTime = data
          .map((pt, idx) => ({ idx, x: Math.round(Number(pt?.x ?? 0)) }))
          .sort((a, b) => a.x - b.x);
        
        const selectedSet = new Set(indices);

        // 2. Identify the Hard Limits for the WHOLE selected group
        let leftLimit = 0;
        let rightLimit = 1439;

        // Find the first non-selected point to the left of our selection
        const firstSortedSelectedPos = allByTime.findIndex(item => selectedSet.has(item.idx));
        if (firstSortedSelectedPos > 0) {
          leftLimit = allByTime[firstSortedSelectedPos - 1].x + 1;
        }

        // Find the first non-selected point to the right of our selection
        let lastSortedSelectedPos = -1;
        for (let i = allByTime.length - 1; i >= 0; i--) {
          if (selectedSet.has(allByTime[i].idx)) {
            lastSortedSelectedPos = i;
            break;
          }
        }
        if (lastSortedSelectedPos !== -1 && lastSortedSelectedPos < allByTime.length - 1) {
          rightLimit = allByTime[lastSortedSelectedPos + 1].x - 1;
        }

        // 3. Compute current extent of the selected group
        const groupMinX = Math.min(...indices.map(i => data[i].x));
        const groupMaxX = Math.max(...indices.map(i => data[i].x));

        // 4. Calculate actual displacement (clamped by hard limits)
        let finalDx = dx;
        if (groupMinX + dx < leftLimit) finalDx = leftLimit - groupMinX;
        if (groupMaxX + dx > rightLimit) finalDx = rightLimit - groupMaxX;

        // 5. Apply movement
        indices.forEach((i) => {
          const p = data[i];
          if (!p) return;
          if (i === 0 || i === data.length - 1) return; // keep anchors fixed
          
          let nx = p.x + finalDx;
          
          if (snapToGrid) {
              const gridSize = 30;
              nx = Math.round(nx / gridSize) * gridSize;
          }

          // Final safety clamp for each point
          p.x = Math.max(leftLimit, Math.min(rightLimit, nx));
        });
    }

    // Persist to state and update chart
    try {
      dataset.data.sort((a, b) => a.x - b.x);
      const newData = dataset.data.map((pt) => ({ time: minutesToTime(pt.x), value: Number(pt.y) }));
      stateMgr.setData(newData);
    } catch (e) { /* ignore */ }

    chartMgr.updatePointStyling(this.card.selectionManager.selectedPoint, this.card.selectionManager.selectedPoints);
    chartMgr.update('none');
    
    // Show tooltip for the first selected point
    if (indices.length > 0) {
        const firstI = indices[0];
        const p = data[firstI];
        if (p) chartMgr.showDragValueDisplay(p.y, p.x);
    }
  }

  handleArrowUpDown(e, indices) {
    const isSwitch = !!this.card.config?.is_switch_preset;
    let step = isSwitch ? 1 : this.card.config.step_value;
    
    // Modifiers
    if (e.ctrlKey || e.metaKey) {
        step = isSwitch ? 1 : (this.card.config.step_value / 5); // Reduce step
        if (step < 0.1) step = 0.1;
    }
    
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
        
        if (e.shiftKey && !isSwitch) {
             // Snap to integer
             val = Math.round(val);
        } else {
             val = roundTo(val, 1);
        }
      }

      if (typeof dataset.data[i] === 'object' && dataset.data[i] !== null) {
        dataset.data[i].y = val;
      } else {
        dataset.data[i] = val;
      }

      stateMgr.updatePoint(i, val);
    });

    chartMgr.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
    chartMgr.update('none');
    
    if (indices.length > 0) {
        const firstI = indices[0];
        const p = dataset.data[firstI];
        if (p) chartMgr.showDragValueDisplay(p.y, p.x);
    }
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
