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
    // If the container is focused, let the container's own listener handle it
    if (active === this.containerEl) return;
    
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
    this.handleKeydown(e);
  }

  _winKeyup(e) {
    if (!this.enabled) return;
    if (!this.containerEl) return;
    const active = this.card.shadowRoot?.activeElement;
    // If the container is focused, let the container's own listener handle it
    if (active === this.containerEl) return;
    
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
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
    
    const config = this.card.config || {};
    const kbGlobalRaw = this.card.globalSettings?.keyboard || {};
    const kbGlobal = {
      def: kbGlobalRaw.def || { horizontal: 5, vertical: 0.5 },
      ctrl: kbGlobalRaw.ctrl || { horizontal: 1, vertical: 0.1 },
      shift: kbGlobalRaw.shift || { horizontal: 30, vertical: 1.0 },
      alt: kbGlobalRaw.alt || { horizontal: 60, vertical: 5.0 }
    };

    // Extract movement settings (Priority: Card Config > Global Settings)
    const settings = {
      def: {
        h: config.kb_def_h !== undefined ? config.kb_def_h : kbGlobal.def.horizontal,
        v: config.kb_def_v !== undefined ? config.kb_def_v : kbGlobal.def.vertical
      },
      ctrl: { 
        h: config.kb_ctrl_h !== undefined ? config.kb_ctrl_h : kbGlobal.ctrl.horizontal,
        v: config.kb_ctrl_v !== undefined ? config.kb_ctrl_v : kbGlobal.ctrl.vertical
      },
      shift: { 
        h: config.kb_shift_h !== undefined ? config.kb_shift_h : kbGlobal.shift.horizontal,
        v: config.kb_shift_v !== undefined ? config.kb_shift_v : kbGlobal.shift.vertical
      },
      alt: { 
        h: config.kb_alt_h !== undefined ? config.kb_alt_h : kbGlobal.alt.horizontal,
        v: config.kb_alt_v !== undefined ? config.kb_alt_v : kbGlobal.alt.vertical
      }
    };

    // Movement logic
    let minutesStep = settings.def.h; // Default
    let snapToGrid = false;

    if (e.ctrlKey || e.metaKey) {
      minutesStep = settings.ctrl.h;
    } else if (e.shiftKey) {
      minutesStep = settings.shift.h;
      snapToGrid = true;
    } else if (e.altKey) {
      minutesStep = settings.alt.h;
      snapToGrid = true;
    }

    const dx = e.key === "ArrowLeft" ? -minutesStep : minutesStep;

    // 0. Expand selection to include switch neighbors (vertical edges)
    let indicesToMove = [...indices];
    if (config.is_switch_preset) {
      const activeSet = new Set(indices);
      const partners = [];
      indices.forEach(idx => {
        const curX = data[idx]?.x;
        if (curX === undefined) return;
        
        // Find immediate neighbors (T-1 or T+1)
        data.forEach((pt, i) => {
          if (activeSet.has(i)) return;
          if (Math.abs(pt.x - curX) <= 1.5) { // tolerant check like chart_manager
             partners.push(i);
          }
        });
      });
      // Merge unique
      indicesToMove = [...new Set([...indices, ...partners])];
      Logger.log('SWITCH', `[Keyboard] Expanded selection for drag: ${JSON.stringify(indices)} -> ${JSON.stringify(indicesToMove)}`);
    }

    // 1. Build a time-sorted list of ALL points to find true neighbors
    const allByTime = data
      .map((pt, idx) => ({ idx, x: Math.round(Number(pt?.x ?? 0)) }))
      .sort((a, b) => a.x - b.x);
    
    const selectedSet = new Set(indicesToMove);

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
    const groupMinX = Math.min(...indicesToMove.map(i => data[i].x));
    const groupMaxX = Math.max(...indicesToMove.map(i => data[i].x));

    // 4. Calculate actual displacement (clamped by hard limits)
    // When snapping, we calculate the delta based on the ANCHOR point (indices[0]),
    // and apply that same delta to all other points to preserve relative distances (e.g. 1 min switch gap).
    
    let moveDelta = 0;
    const anchorIdx = indices[0];
    const anchorP = data[anchorIdx];
    
    if (anchorP) {
        let targetX = anchorP.x + dx;
        
        if (snapToGrid) {
            const gridSize = minutesStep;
            targetX = Math.round(targetX / gridSize) * gridSize;
        }
        
        moveDelta = targetX - anchorP.x;
    } else {
        moveDelta = dx; // Fallback
    }

    // Check bounds for the WHOLE group with this calculated delta
    if (groupMinX + moveDelta < leftLimit) {
        moveDelta = leftLimit - groupMinX;
    }
    if (groupMaxX + moveDelta > rightLimit) {
        moveDelta = rightLimit - groupMaxX;
    }

    // 5. Apply movement
    indicesToMove.forEach((i) => {
      const p = data[i];
      if (!p) return;
      if (i === 0 || i === data.length - 1) return; // keep anchors fixed
      
      const oldX = p.x;
      let nx = p.x + moveDelta;
      
      // Final safety clamp for each point (redundant if group logic is correct, but safe)
      p.x = Math.max(leftLimit, Math.min(rightLimit, nx));
      Logger.log('SWITCH', `[KeyboardMove] Point ${i}: ${minutesToTime(oldX)} -> ${minutesToTime(p.x)}`);
    });

    // Persist to state and update chart
    try {
      dataset.data.sort((a, b) => a.x - b.x);
      const newData = dataset.data.map((pt) => ({ time: minutesToTime(pt.x), value: Number(pt.y) }));
      stateMgr.setData(newData);
    } catch (e) { /* ignore */ }

    chartMgr.updatePointStyling(this.card.selectionManager.selectedPoint, this.card.selectionManager.selectedPoints);
    chartMgr.update('none');
    
    // Show tooltip for the first selected point with updated values
    if (indices.length > 0) {
        const firstIdx = indices[0];
        const p = dataset.data[firstIdx]; // Use dataset.data directly
        if (p) {
          chartMgr.showDragValueDisplay(p.y, p.x);
        }
    }
  }

  handleArrowUpDown(e, indices) {
    // Disable vertical movement with Alt key
    if (e.altKey) return;

    const isSwitch = !!this.card.config?.is_switch_preset;
    const config = this.card.config || {};
    const kbGlobalRaw = this.card.globalSettings?.keyboard || {};
    const kbGlobal = {
      def: kbGlobalRaw.def || { horizontal: 5, vertical: 0.5 },
      ctrl: kbGlobalRaw.ctrl || { horizontal: 1, vertical: 0.1 },
      shift: kbGlobalRaw.shift || { horizontal: 30, vertical: 1.0 },
      alt: kbGlobalRaw.alt || { horizontal: 60, vertical: 5.0 }
    };

    // Extract movement settings
    const settings = {
      def: config.kb_def_v !== undefined ? config.kb_def_v : kbGlobal.def.vertical,
      ctrl: config.kb_ctrl_v !== undefined ? config.kb_ctrl_v : kbGlobal.ctrl.vertical,
      shift: config.kb_shift_v !== undefined ? config.kb_shift_v : kbGlobal.shift.vertical,
      alt: config.kb_alt_v !== undefined ? config.kb_alt_v : kbGlobal.alt.vertical
    };

    let step = isSwitch ? 1 : settings.def;
    
    if (e.ctrlKey || e.metaKey) {
      step = isSwitch ? 1 : settings.ctrl;
    } else if (e.shiftKey) {
      step = isSwitch ? 1 : settings.shift;
    } else if (e.altKey) {
      step = isSwitch ? 1 : settings.alt;
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
    const data = dataset.data;
    
    // For switches, implement strict 'transition partner' movement
    let targetIndices = [...indices];
    if (isSwitch) {
      const activeSet = new Set(indices);
      const partners = [];
      
      indices.forEach(idx => {
        const curX = data[idx].x;
        // Check immediate neighbors (T-1 and T+1) to see if they are transition partners
        for (let i = 0; i < data.length; i++) {
            if (activeSet.has(i)) continue;
            const otherX = data[i].x;
            if (Math.abs(curX - otherX) === 1) {
                partners.push(i);
            }
        }
      });
      targetIndices = [...new Set([...indices, ...partners])];
    }

    // Move identified points in chart data
    targetIndices.forEach(i => {
      const current = data[i];
      const currentVal = (typeof current === 'object' && current !== null) ? Number(current.y) : Number(current);
      let val = currentVal + delta;
      
      if (isSwitch) {
        val = e.key === 'ArrowUp' ? 1 : 0;
      } else {
        val = clamp(val, this.card.config.min_value, upperClamp);
        const decimals = step < 1 ? 1 : 0;
        val = roundTo(val, decimals);
      }

      if (typeof data[i] === 'object' && data[i] !== null) {
        data[i].y = val;
      } else {
        data[i] = val;
      }
    });

    // --- PRESERVE SELECTION BY TIME ---
    // Save times of currently selected points
    const selectedTimes = indices.map(i => data[i]?.x !== undefined ? minutesToTime(data[i].x) : null).filter(t => t !== null);

    // Notify state manager with the full new dataset to trigger finalizeSwitchData
    const schedule = data.map(p => ({
      time: minutesToTime(p.x),
      value: (typeof p === 'object') ? p.y : p
    }));
    stateMgr.setData(schedule);

    // Restore selection based on time labels
    const newSchedule = stateMgr.getData();
    const newIndices = selectedTimes
      .map(t => newSchedule.findIndex(p => p.time === t))
      .filter(idx => idx !== -1);
    
    if (newIndices.length > 0) {
      selMgr.selectIndices(newIndices, false);
    }

    chartMgr.updatePointStyling(selMgr.selectedPoint, selMgr.selectedPoints);
    chartMgr.update('none');
    
    if (indices.length > 0) {
        const firstIdx = indices[0];
        const p = dataset.data[firstIdx];
        if (p) {
          chartMgr.showDragValueDisplay(p.y, p.x);
        }
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
